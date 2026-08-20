"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";
import { displayClientName } from "@/lib/crm/format";
import { manualLeadClientKey } from "@/lib/crm/manualLeadClientKey";
import { CP_TOOL_PATH, commercialProposalPath, commercialProposalPricesPath, commercialProposalTemplatePath } from "@/lib/crm/commercialProposalPaths";
import { buildClientListSearchOrClause, sanitizeForPostgrestOrClause } from "@/lib/crm/postgrestSearch";
import {
  defaultTemplateContent,
  mergeTemplateContent,
  type CpTemplateContent,
} from "@/lib/commercialProposal/content";
import { generateCommercialProposalPdf } from "@/lib/commercialProposal/generatePdf";
import { generateCommercialProposalPdfV2 } from "@/lib/commercialProposal/generatePdfV2";
import {
  categoryDiscount,
  discountsFromSnapshot,
  normalizeCategoryDiscounts,
  uniformDiscountPct,
  ZERO_CATEGORY_DISCOUNTS,
  type CpCategoryDiscounts,
} from "@/lib/commercialProposal/discounts";
import { applyGlobalDiscount, parseMoneyInput } from "@/lib/commercialProposal/money";
import {
  buildProposalSnapshot,
  catalogItemToLineFields,
  displayManagerName,
  recipientFromClientFields,
  recalculateLine,
} from "@/lib/commercialProposal/snapshot";
import {
  CP_CATEGORIES,
  CP_DEFAULT_TEMPLATE_VERSION,
  CP_TEMPLATE_LT_COMMERCIAL_V1,
  CP_TEMPLATE_LT_COMMERCIAL_V2,
  type CpRecipientType,
} from "@/lib/commercialProposal/types";
import type {
  CommercialProposalLine,
  CommercialProposalRow,
  CommercialProposalSalesManagerSnapshot,
  CommercialProposalSnapshot,
  CommercialProposalStatus,
  CpCompanyHistoryEntry,
  CpPriceCategory,
  CpPriceItem,
} from "@/lib/commercialProposal/types";

const BUCKET = "commercial-proposals";

function canUseProposals(user: Awaited<ReturnType<typeof getCurrentCrmUser>>): boolean {
  return Boolean(
    user &&
      (hasPermission(user, "nav.tools.commercial_proposals") ||
        hasPermission(user, "nav.clients") ||
        hasPermission(user, "settings.commercial_proposals"))
  );
}

function canAdminCatalog(user: Awaited<ReturnType<typeof getCurrentCrmUser>>): boolean {
  return Boolean(user && hasPermission(user, "settings.commercial_proposals"));
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapPriceItem(row: Record<string, unknown>): CpPriceItem {
  return {
    id: String(row.id),
    category: row.category as CpPriceCategory,
    sort_order: Number(row.sort_order),
    label: String(row.label ?? ""),
    base_price: toNum(row.base_price),
    currency: String(row.currency ?? "EUR"),
    unit: row.unit == null ? null : String(row.unit),
    is_from_price: Boolean(row.is_from_price),
    is_free: Boolean(row.is_free),
    active: Boolean(row.active),
  };
}

function mapLine(row: Record<string, unknown>): CommercialProposalLine {
  return {
    id: String(row.id),
    proposal_id: String(row.proposal_id),
    category: row.category as CpPriceCategory,
    catalog_item_id: row.catalog_item_id == null ? null : String(row.catalog_item_id),
    sort_order: Number(row.sort_order),
    label: String(row.label ?? ""),
    base_price: toNum(row.base_price),
    calculated_price: toNum(row.calculated_price),
    final_price: toNum(row.final_price),
    is_manual_override: Boolean(row.is_manual_override),
    is_from_price: Boolean(row.is_from_price),
    is_free: Boolean(row.is_free),
    included: row.included == null ? true : Boolean(row.included),
    currency: String(row.currency ?? "EUR"),
    unit: row.unit == null ? null : String(row.unit),
  };
}

function mapProposal(row: Record<string, unknown>): CommercialProposalRow {
  const clientName = String(row.client_name ?? "");
  const recipientType: CpRecipientType = row.recipient_type === "lead" ? "lead" : "client";
  return {
    id: String(row.id),
    proposal_number: row.proposal_number == null ? null : String(row.proposal_number),
    status: String(row.status ?? "draft") as CommercialProposalStatus,
    template_version: String(row.template_version ?? CP_TEMPLATE_LT_COMMERCIAL_V1),
    client_key: String(row.client_key ?? ""),
    client_id: row.client_id == null ? null : String(row.client_id),
    company_code: row.company_code == null ? null : String(row.company_code),
    client_name: clientName,
    recipient_type: recipientType,
    recipient_id: row.recipient_id == null ? row.client_id == null ? null : String(row.client_id) : String(row.recipient_id),
    recipient_name: String(row.recipient_name ?? clientName),
    contact_name: row.contact_name == null ? null : String(row.contact_name),
    recipient_email: row.recipient_email == null ? null : String(row.recipient_email),
    recipient_phone: row.recipient_phone == null ? null : String(row.recipient_phone),
    sales_manager_id: row.sales_manager_id == null ? null : String(row.sales_manager_id),
    global_discount_pct: toNum(row.global_discount_pct) ?? 0,
    discounts: discountsFromSnapshot({
      discounts: (row.snapshot as CommercialProposalSnapshot | null)?.discounts,
      global_discount_pct: toNum(row.global_discount_pct) ?? 0,
    }),
    created_by: row.created_by == null ? null : String(row.created_by),
    generated_at: row.generated_at == null ? null : String(row.generated_at),
    pdf_storage_path: row.pdf_storage_path == null ? null : String(row.pdf_storage_path),
    snapshot: (row.snapshot as CommercialProposalSnapshot | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function revalidateProposalTool(proposalId?: string) {
  revalidatePath(CP_TOOL_PATH);
  if (proposalId) revalidatePath(commercialProposalPath(proposalId));
  revalidatePath(commercialProposalTemplatePath());
  revalidatePath(commercialProposalPricesPath());
}

export type ProposalRecipientOption = {
  recipientType: CpRecipientType;
  recipientId: string;
  recipientName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  companyCode: string | null;
  clientKey: string;
  clientId: string | null;
  projectName?: string | null;
};

async function loadLeadSummary(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  leadId: string
): Promise<ProposalRecipientOption | null> {
  const { data, error } = await admin
    .from("project_manual_leads")
    .select("id,company_name,company_code,contact_name,email,phone,project_id")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const company = String(data.company_name ?? "").trim();
  const contact = data.contact_name == null ? null : String(data.contact_name);
  return {
    recipientType: "lead",
    recipientId: String(data.id),
    recipientName: company || contact || "Lead",
    contactName: contact,
    email: data.email == null ? null : String(data.email),
    phone: data.phone == null ? null : String(data.phone),
    companyCode: data.company_code == null ? null : String(data.company_code),
    clientKey: manualLeadClientKey(String(data.id)),
    clientId: null,
  };
}

async function loadClientSummary(admin: ReturnType<typeof createSupabaseAdminClient>, clientId: string) {
  const segment = decodeURIComponent(clientId);
  const { data, error } = await admin
    .from("v_client_list_from_invoices")
    .select("client_key,company_code,client_id,company_name,email,phone")
    .eq("client_id", segment)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    client_key: String(data.client_key ?? ""),
    client_id: data.client_id == null ? null : String(data.client_id),
    company_code: data.company_code == null ? null : String(data.company_code),
    name: displayClientName(String(data.company_name ?? ""), data.company_code == null ? null : String(data.company_code)),
    email: data.email == null ? null : String(data.email),
    phone: data.phone == null ? null : String(data.phone),
  };
}

async function loadManagerSnapshot(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
): Promise<CommercialProposalSalesManagerSnapshot | null> {
  const { data, error } = await admin
    .from("crm_users")
    .select("id,first_name,last_name,name,email,phone,avatar_url,job_title,status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const first = String(data.first_name ?? "");
  const last = String(data.last_name ?? "");
  const display = displayManagerName(first, last, String(data.name ?? ""));
  const job = String(data.job_title ?? "").trim() || "Pardavimų vadybininkas";
  return {
    id: String(data.id),
    first_name: first,
    last_name: last,
    display_name: display,
    job_title: job,
    email: data.email == null ? null : String(data.email),
    phone: data.phone == null ? null : String(data.phone),
    avatar_url: data.avatar_url == null ? null : String(data.avatar_url),
  };
}

async function loadCatalog(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<CpPriceItem[]> {
  const { data, error } = await admin
    .from("cp_price_items")
    .select("id,category,sort_order,label,base_price,currency,unit,is_from_price,is_free,active")
    .eq("active", true)
    .order("category")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPriceItem(r as Record<string, unknown>));
}

async function loadHistory(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<CpCompanyHistoryEntry[]> {
  const { data, error } = await admin
    .from("cp_company_history")
    .select("id,year,body,sort_order,active")
    .eq("active", true)
    .order("sort_order")
    .order("year");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    year: Number(r.year),
    body: String(r.body ?? ""),
    sort_order: Number(r.sort_order),
    active: Boolean(r.active),
  }));
}

async function loadLines(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposalId: string
): Promise<CommercialProposalLine[]> {
  const { data, error } = await admin
    .from("commercial_proposal_lines")
    .select(
      "id,proposal_id,category,catalog_item_id,sort_order,label,base_price,calculated_price,final_price,is_manual_override,is_from_price,is_free,included,currency,unit"
    )
    .eq("proposal_id", proposalId)
    .order("category")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapLine(r as Record<string, unknown>));
}

async function loadDiscounts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposalId: string,
  fallback = 0
): Promise<CpCategoryDiscounts> {
  const { data, error } = await admin
    .from("commercial_proposal_discounts")
    .select("category,percentage")
    .eq("proposal_id", proposalId);
  if (error) throw new Error(error.message);
  const raw: Partial<Record<string, number>> = {};
  for (const row of data ?? []) {
    raw[String(row.category)] = toNum(row.percentage) ?? 0;
  }
  return normalizeCategoryDiscounts(raw, fallback);
}

async function loadDiscountsForProposals(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposalIds: string[]
): Promise<Map<string, CpCategoryDiscounts>> {
  const out = new Map<string, CpCategoryDiscounts>();
  if (proposalIds.length === 0) return out;
  const { data, error } = await admin
    .from("commercial_proposal_discounts")
    .select("proposal_id,category,percentage")
    .in("proposal_id", proposalIds);
  if (error) throw new Error(error.message);
  const grouped = new Map<string, Partial<Record<string, number>>>();
  for (const row of data ?? []) {
    const id = String(row.proposal_id);
    const cur = grouped.get(id) ?? {};
    cur[String(row.category)] = toNum(row.percentage) ?? 0;
    grouped.set(id, cur);
  }
  for (const [id, raw] of grouped) {
    out.set(id, normalizeCategoryDiscounts(raw, 0));
  }
  return out;
}

async function upsertDiscounts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposalId: string,
  discounts: CpCategoryDiscounts
): Promise<void> {
  const rows = CP_CATEGORIES.map((category) => ({
    proposal_id: proposalId,
    category,
    percentage: discounts[category],
  }));
  const { error } = await admin.from("commercial_proposal_discounts").upsert(rows, {
    onConflict: "proposal_id,category",
  });
  if (error) throw new Error(error.message);
}

async function recalculateProposalLines(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposalId: string,
  discounts: CpCategoryDiscounts
): Promise<void> {
  const lines = await loadLines(admin, proposalId);
  for (const line of lines) {
    const next = recalculateLine(line, categoryDiscount(discounts, line.category));
    const { error } = await admin
      .from("commercial_proposal_lines")
      .update({ calculated_price: next.calculated_price, final_price: next.final_price })
      .eq("id", line.id);
    if (error) throw new Error(error.message);
  }
}

async function ensurePdfBucket(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw error;
  const exists = (buckets ?? []).some((b) => b.name === BUCKET || b.id === BUCKET);
  if (!exists) {
    const { error: cErr } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 20 * 1024 * 1024 });
    if (cErr) throw cErr;
  }
}

export async function createCommercialProposalAction(input: {
  recipientType: CpRecipientType;
  recipientId: string;
  recipientName?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const recipientType = input.recipientType === "lead" ? "lead" : "client";
  const recipientId = String(input.recipientId ?? "").trim();
  if (!recipientId) return { ok: false, error: "Pasirinkite gavėją." };

  const admin = createSupabaseAdminClient();
  let recipient: ProposalRecipientOption | null = null;
  if (recipientType === "client") {
    const client = await loadClientSummary(admin, recipientId);
    if (!client) return { ok: false, error: "Klientas nerastas." };
    recipient = {
      recipientType: "client",
      recipientId: client.client_id || client.client_key,
      recipientName: client.name,
      contactName: null,
      email: client.email,
      phone: client.phone,
      companyCode: client.company_code,
      clientKey: client.client_key,
      clientId: client.client_id,
    };
  } else {
    recipient = await loadLeadSummary(admin, recipientId);
    if (!recipient) return { ok: false, error: "Lead nerastas." };
  }

  const recipientName = (input.recipientName ?? recipient.recipientName).trim() || recipient.recipientName;

  const catalog = await loadCatalog(admin);
  const { data: inserted, error } = await admin
    .from("commercial_proposals")
    .insert({
      status: "draft",
      template_version: CP_DEFAULT_TEMPLATE_VERSION,
      client_key: recipient.clientKey,
      client_id: recipient.clientId,
      company_code: recipient.companyCode,
      client_name: recipientName,
      recipient_type: recipient.recipientType,
      recipient_id: recipient.recipientId,
      recipient_name: recipientName,
      contact_name: recipient.contactName,
      recipient_email: recipient.email,
      recipient_phone: recipient.phone,
      sales_manager_id: actor.id,
      global_discount_pct: 0,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? "Nepavyko sukurti pasiūlymo." };

  try {
    await upsertDiscounts(admin, inserted.id, ZERO_CATEGORY_DISCOUNTS);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepavyko įrašyti nuolaidų." };
  }

  const lines = catalog.map((item) => ({
    proposal_id: inserted.id,
    ...catalogItemToLineFields(item, 0),
  }));
  if (lines.length) {
    const { error: lErr } = await admin.from("commercial_proposal_lines").insert(lines);
    if (lErr) return { ok: false, error: lErr.message };
  }

  revalidateProposalTool(inserted.id);
  return { ok: true, id: inserted.id };
}

export type ProposalEditorPayload = {
  proposal: CommercialProposalRow;
  lines: CommercialProposalLine[];
  discounts: CpCategoryDiscounts;
  managers: Array<{ id: string; name: string; job_title: string }>;
  canChangeManager: boolean;
};

export async function loadProposalEditorData(proposalId: string): Promise<ProposalEditorPayload> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("commercial_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Pasiūlymas nerastas.");
  const proposal = mapProposal(data as Record<string, unknown>);
  const discounts = proposal.snapshot
    ? discountsFromSnapshot(proposal.snapshot)
    : await loadDiscounts(admin, proposal.id, proposal.global_discount_pct);
  proposal.discounts = discounts;
  const lines = proposal.snapshot?.lines
    ? proposal.snapshot.lines.map((l, i) => ({
        id: `snap-${i}`,
        proposal_id: proposal.id,
        ...l,
        included: l.included !== false,
      }))
    : await loadLines(admin, proposal.id);

  const { data: users, error: uErr } = await admin
    .from("crm_users")
    .select("id,first_name,last_name,name,job_title,status")
    .eq("status", "active")
    .order("first_name");
  if (uErr) throw new Error(uErr.message);
  const managers = (users ?? []).map((u) => ({
    id: String(u.id),
    name: displayManagerName(String(u.first_name ?? ""), String(u.last_name ?? ""), String(u.name ?? "")),
    job_title: String(u.job_title ?? "").trim() || "Pardavimų vadybininkas",
  }));

  return {
    proposal,
    lines,
    discounts,
    managers,
    canChangeManager: true,
  };
}

export async function searchProposalRecipientsAction(input: {
  recipientType: CpRecipientType;
  query: string;
}): Promise<ProposalRecipientOption[]> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) throw new Error("Not authorized");
  const q = input.query.trim();
  if (q.length < 2) return [];
  const admin = createSupabaseAdminClient();

  if (input.recipientType === "client") {
    const or = buildClientListSearchOrClause(q);
    if (!or) return [];
    const { data, error } = await admin
      .from("v_client_list_from_invoices")
      .select("client_key,company_code,client_id,company_name,email,phone")
      .or(or)
      .order("company_name", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const name = displayClientName(
        String(row.company_name ?? ""),
        row.company_code == null ? null : String(row.company_code)
      );
      return {
        recipientType: "client" as const,
        recipientId: String(row.client_id ?? row.client_key ?? ""),
        recipientName: name,
        contactName: null,
        email: row.email == null ? null : String(row.email),
        phone: row.phone == null ? null : String(row.phone),
        companyCode: row.company_code == null ? null : String(row.company_code),
        clientKey: String(row.client_key ?? ""),
        clientId: row.client_id == null ? null : String(row.client_id),
      };
    });
  }

  const sanitized = sanitizeForPostgrestOrClause(q);
  if (!sanitized) return [];
  const like = `%${sanitized.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const { data, error } = await admin
    .from("project_manual_leads")
    .select("id,company_name,company_code,contact_name,email,phone,status,project_id")
    .or(`company_name.ilike.${like},contact_name.ilike.${like},email.ilike.${like},company_code.ilike.${like}`)
    .order("company_name", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);

  const projectIds = [...new Set((data ?? []).map((r) => String(r.project_id ?? "")).filter(Boolean))];
  const projectNames = new Map<string, string>();
  if (projectIds.length) {
    const { data: projects } = await admin.from("projects").select("id,name").in("id", projectIds);
    for (const p of projects ?? []) projectNames.set(String(p.id), String(p.name ?? ""));
  }

  return (data ?? []).map((row) => {
    const company = String(row.company_name ?? "").trim();
    const contact = row.contact_name == null ? null : String(row.contact_name);
    return {
      recipientType: "lead" as const,
      recipientId: String(row.id),
      recipientName: company || contact || "Lead",
      contactName: contact,
      email: row.email == null ? null : String(row.email),
      phone: row.phone == null ? null : String(row.phone),
      companyCode: row.company_code == null ? null : String(row.company_code),
      clientKey: manualLeadClientKey(String(row.id)),
      clientId: null,
      projectName: row.project_id ? projectNames.get(String(row.project_id)) ?? null : null,
    };
  });
}

export type ProposalListRow = CommercialProposalRow & { manager_name: string | null };

export async function listAllProposalsAction(input?: { search?: string }): Promise<ProposalListRow[]> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  let q = admin.from("commercial_proposals").select("*").order("created_at", { ascending: false }).limit(500);
  const search = sanitizeForPostgrestOrClause(input?.search ?? "");
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    q = q.or(`proposal_number.ilike.${like},recipient_name.ilike.${like},client_name.ilike.${like},contact_name.ilike.${like}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const managerIds = [
    ...new Set((data ?? []).map((row) => String((row as { sales_manager_id?: unknown }).sales_manager_id ?? "")).filter(Boolean)),
  ];
  const names = new Map<string, string>();
  if (managerIds.length) {
    const { data: users } = await admin.from("crm_users").select("id,first_name,last_name,name").in("id", managerIds);
    for (const u of users ?? []) {
      names.set(
        String(u.id),
        displayManagerName(String(u.first_name ?? ""), String(u.last_name ?? ""), String(u.name ?? ""))
      );
    }
  }
  const proposalIds = (data ?? []).map((row) => String((row as { id: unknown }).id));
  const discountMap = await loadDiscountsForProposals(admin, proposalIds);
  return (data ?? []).map((row) => {
    const p = mapProposal(row as Record<string, unknown>);
    p.discounts = discountMap.get(p.id) ?? p.discounts;
    return { ...p, manager_name: p.sales_manager_id ? names.get(p.sales_manager_id) ?? null : null };
  });
}

export async function listClientProposalsAction(clientId: string): Promise<
  Array<
    CommercialProposalRow & {
      manager_name: string | null;
    }
  >
> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  const client = await loadClientSummary(admin, clientId);
  if (!client) return [];

  let q = admin
    .from("commercial_proposals")
    .select("*")
    .order("created_at", { ascending: false });
  if (client.client_id) q = q.eq("client_id", client.client_id);
  else if (client.company_code) q = q.eq("company_code", client.company_code);
  else q = q.eq("client_key", client.client_key);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const managerIds = [...new Set((data ?? []).map((row) => String((row as { sales_manager_id?: unknown }).sales_manager_id ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  if (managerIds.length) {
    const { data: users } = await admin
      .from("crm_users")
      .select("id,first_name,last_name,name")
      .in("id", managerIds);
    for (const u of users ?? []) {
      names.set(
        String(u.id),
        displayManagerName(String(u.first_name ?? ""), String(u.last_name ?? ""), String(u.name ?? ""))
      );
    }
  }
  const proposalIds = (data ?? []).map((row) => String((row as { id: unknown }).id));
  const discountMap = await loadDiscountsForProposals(admin, proposalIds);
  return (data ?? []).map((row) => {
    const p = mapProposal(row as Record<string, unknown>);
    p.discounts = discountMap.get(p.id) ?? p.discounts;
    return {
      ...p,
      manager_name: p.sales_manager_id ? names.get(p.sales_manager_id) ?? null : null,
    };
  });
}

export async function updateProposalSettingsAction(input: {
  proposalId: string;
  salesManagerId: string;
  recipientName?: string;
  categoryDiscounts?: Partial<CpCategoryDiscounts>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("commercial_proposals")
    .select("id,status,global_discount_pct")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Pasiūlymas nerastas." };
  if (String(row.status) !== "draft") return { ok: false, error: "Keisti galima tik juodraštį." };

  const current = await loadDiscounts(admin, input.proposalId, toNum(row.global_discount_pct) ?? 0);
  const discounts = input.categoryDiscounts
    ? normalizeCategoryDiscounts({ ...current, ...input.categoryDiscounts })
    : current;
  const patch: Record<string, unknown> = {
    sales_manager_id: input.salesManagerId,
    global_discount_pct: uniformDiscountPct(discounts) ?? 0,
  };
  if (typeof input.recipientName === "string") {
    const name = input.recipientName.trim();
    if (name) {
      patch.recipient_name = name;
      patch.client_name = name;
    }
  }
  const { error: uErr } = await admin.from("commercial_proposals").update(patch).eq("id", input.proposalId);
  if (uErr) return { ok: false, error: uErr.message };

  if (input.categoryDiscounts) {
    try {
      await upsertDiscounts(admin, input.proposalId, discounts);
      await recalculateProposalLines(admin, input.proposalId, discounts);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Nepavyko perskaičiuoti kainų." };
    }
  }

  revalidateProposalTool(input.proposalId);
  return { ok: true };
}

export async function overrideProposalLineAction(input: {
  proposalId: string;
  lineId: string;
  finalPrice: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const price = parseMoneyInput(input.finalPrice);
  if (price == null) return { ok: false, error: "Neteisinga kaina." };
  const admin = createSupabaseAdminClient();
  const { data: proposal, error: pErr } = await admin
    .from("commercial_proposals")
    .select("id,status,client_id")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (pErr || !proposal) return { ok: false, error: "Pasiūlymas nerastas." };
  if (String(proposal.status) !== "draft") return { ok: false, error: "Keisti galima tik juodraštį." };

  const { error } = await admin
    .from("commercial_proposal_lines")
    .update({ final_price: price, is_manual_override: true, is_free: false })
    .eq("id", input.lineId)
    .eq("proposal_id", input.proposalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resetProposalLineAction(input: {
  proposalId: string;
  lineId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { data: proposal, error: pErr } = await admin
    .from("commercial_proposals")
    .select("id,status,global_discount_pct")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (pErr || !proposal) return { ok: false, error: "Pasiūlymas nerastas." };
  if (String(proposal.status) !== "draft") return { ok: false, error: "Keisti galima tik juodraštį." };

  const { data: line, error: lErr } = await admin
    .from("commercial_proposal_lines")
    .select("*")
    .eq("id", input.lineId)
    .eq("proposal_id", input.proposalId)
    .maybeSingle();
  if (lErr || !line) return { ok: false, error: "Eilutė nerasta." };
  const mapped = mapLine(line as Record<string, unknown>);
  const discounts = await loadDiscounts(admin, input.proposalId, toNum(proposal.global_discount_pct) ?? 0);
  const calculated =
    mapped.is_free || mapped.base_price == null
      ? null
      : applyGlobalDiscount(mapped.base_price, categoryDiscount(discounts, mapped.category));
  const { error } = await admin
    .from("commercial_proposal_lines")
    .update({
      is_manual_override: false,
      calculated_price: calculated,
      final_price: calculated,
    })
    .eq("id", input.lineId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateProposalLineInclusionAction(input: {
  proposalId: string;
  included: boolean;
  lineIds?: string[];
  category?: CpPriceCategory;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { data: proposal, error: pErr } = await admin
    .from("commercial_proposals")
    .select("id,status")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (pErr || !proposal) return { ok: false, error: "Pasiūlymas nerastas." };
  if (String(proposal.status) !== "draft") return { ok: false, error: "Keisti galima tik juodraštį." };

  const lineIds = (input.lineIds ?? []).filter(Boolean);
  if (lineIds.length === 0 && !input.category) {
    return { ok: false, error: "Nepasirinktos eilutės." };
  }

  let q = admin
    .from("commercial_proposal_lines")
    .update({ included: input.included })
    .eq("proposal_id", input.proposalId);
  if (lineIds.length) q = q.in("id", lineIds);
  if (input.category) q = q.eq("category", input.category);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  revalidateProposalTool(input.proposalId);
  return { ok: true };
}

async function snapshotFromDraft(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposal: CommercialProposalRow,
  lines: CommercialProposalLine[],
  proposalNumber: string | null,
  generatedAt: string | null
): Promise<CommercialProposalSnapshot> {
  const managerId = proposal.sales_manager_id;
  if (!managerId) throw new Error("Nepasirinktas vadybininkas.");
  const manager = await loadManagerSnapshot(admin, managerId);
  if (!manager) throw new Error("Vadybininkas nerastas.");
  const history = await loadHistory(admin);
  const recipientName = proposal.recipient_name || proposal.client_name;
  const published =
    proposal.template_version === CP_TEMPLATE_LT_COMMERCIAL_V2
      ? await loadPublishedTemplateRevision(admin)
      : null;
  const discounts = await loadDiscounts(admin, proposal.id, proposal.global_discount_pct);
  const includedLines = lines.filter((line) => line.included !== false);
  if (includedLines.length === 0) {
    throw new Error("Pasirinkite bent vieną paslaugą.");
  }
  return buildProposalSnapshot({
    proposalNumber,
    createdAt: proposal.created_at,
    generatedAt,
    templateVersion: proposal.template_version,
    globalDiscountPct: uniformDiscountPct(discounts) ?? 0,
    discounts,
    client: {
      client_key: proposal.client_key,
      client_id: proposal.client_id,
      company_code: proposal.company_code,
      name: recipientName,
    },
    recipient: recipientFromClientFields({
      recipientType: proposal.recipient_type,
      recipientId: proposal.recipient_id,
      recipientName,
      contactName: proposal.contact_name,
      email: proposal.recipient_email,
      phone: proposal.recipient_phone,
      clientKey: proposal.client_key,
      clientId: proposal.client_id,
      companyCode: proposal.company_code,
    }),
    salesManager: manager,
    history,
    lines: includedLines.map(({ id: _id, proposal_id: _pid, ...rest }) => rest),
    template: published?.content,
    templateRevisionId: published?.id ?? null,
  });
}

export async function generateProposalPdfBytes(proposalId: string): Promise<Uint8Array> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("commercial_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Pasiūlymas nerastas.");
  const proposal = mapProposal(data as Record<string, unknown>);

  if (proposal.status !== "draft" && proposal.snapshot) {
    return generateCommercialProposalPdf({ snapshot: proposal.snapshot });
  }

  const lines = await loadLines(admin, proposal.id);
  const snapshot = await snapshotFromDraft(admin, proposal, lines, proposal.proposal_number, proposal.generated_at);
  return generateCommercialProposalPdf({ snapshot });
}

export async function generateCommercialProposalAction(
  proposalId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("commercial_proposals").select("*").eq("id", proposalId).maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? "Pasiūlymas nerastas." };
    const proposal = mapProposal(data as Record<string, unknown>);
    if (proposal.status !== "draft") return { ok: false, error: "PDF jau sugeneruotas." };

    const { data: numRow, error: nErr } = await admin.rpc("next_commercial_proposal_number");
    if (nErr || !numRow) return { ok: false, error: nErr?.message ?? "Nepavyko suteikti numerio." };
    const proposalNumber = String(numRow);
    const generatedAt = new Date().toISOString();
    const lines = await loadLines(admin, proposal.id);
    const snapshot = await snapshotFromDraft(admin, proposal, lines, proposalNumber, generatedAt);
    const pdf = await generateCommercialProposalPdf({ snapshot });

    await ensurePdfBucket(admin);
    const objectPath = `${proposal.id}/proposal.pdf`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, pdf, {
      upsert: true,
      contentType: "application/pdf",
      cacheControl: "3600",
    });
    if (upErr) return { ok: false, error: upErr.message };

    const { error: uErr } = await admin
      .from("commercial_proposals")
      .update({
        status: "generated",
        proposal_number: proposalNumber,
        generated_at: generatedAt,
        pdf_storage_path: objectPath,
        snapshot,
      })
      .eq("id", proposal.id);
    if (uErr) return { ok: false, error: uErr.message };

    revalidateProposalTool(proposal.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepavyko sugeneruoti PDF." };
  }
}

export async function duplicateCommercialProposalAction(
  proposalId: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("commercial_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "Pasiūlymas nerastas." };
  const source = mapProposal(data as Record<string, unknown>);
  const sourceLines = await loadLines(admin, source.id);
  const discounts = source.snapshot
    ? discountsFromSnapshot(source.snapshot)
    : await loadDiscounts(admin, source.id, source.global_discount_pct);

  const { data: inserted, error: iErr } = await admin
    .from("commercial_proposals")
    .insert({
      status: "draft",
      template_version: source.template_version || CP_DEFAULT_TEMPLATE_VERSION,
      client_key: source.client_key,
      client_id: source.client_id,
      company_code: source.company_code,
      client_name: source.recipient_name || source.client_name,
      recipient_type: source.recipient_type || "client",
      recipient_id: source.recipient_id || source.client_id,
      recipient_name: source.recipient_name || source.client_name,
      contact_name: source.contact_name,
      recipient_email: source.recipient_email,
      recipient_phone: source.recipient_phone,
      sales_manager_id: source.sales_manager_id ?? actor.id,
      global_discount_pct: uniformDiscountPct(discounts) ?? source.global_discount_pct,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (iErr || !inserted) return { ok: false, error: iErr?.message ?? "Nepavyko dubliuoti." };
  try {
    await upsertDiscounts(admin, inserted.id, discounts);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepavyko nukopijuoti nuolaidų." };
  }

  const lines = sourceLines.map((l) => ({
    proposal_id: inserted.id,
    category: l.category,
    catalog_item_id: l.catalog_item_id,
    sort_order: l.sort_order,
    label: l.label,
    base_price: l.base_price,
    calculated_price: l.calculated_price,
    final_price: l.final_price,
    is_manual_override: l.is_manual_override,
    is_from_price: l.is_from_price,
    is_free: l.is_free,
    included: l.included !== false,
    currency: l.currency,
    unit: l.unit,
  }));
  if (lines.length) {
    const { error: lErr } = await admin.from("commercial_proposal_lines").insert(lines);
    if (lErr) return { ok: false, error: lErr.message };
  }

  revalidateProposalTool(inserted.id);
  return { ok: true, id: inserted.id };
}

export async function markProposalSentAction(
  proposalId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("commercial_proposals")
    .select("id,status,client_id")
    .eq("id", proposalId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Pasiūlymas nerastas." };
  if (String(data.status) === "draft") return { ok: false, error: "Pirmiausia sugeneruokite PDF." };
  const { error: uErr } = await admin.from("commercial_proposals").update({ status: "sent" }).eq("id", proposalId);
  if (uErr) return { ok: false, error: uErr.message };
  revalidateProposalTool(proposalId);
  return { ok: true };
}

export async function getProposalPdfSignedUrl(proposalId: string): Promise<string | null> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("commercial_proposals")
    .select("pdf_storage_path")
    .eq("id", proposalId)
    .maybeSingle();
  if (error || !data?.pdf_storage_path) return null;
  const { data: signed, error: sErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(String(data.pdf_storage_path), 60 * 30);
  if (sErr) return null;
  return signed?.signedUrl ?? null;
}

export async function listCompanyHistoryAdmin(): Promise<CpCompanyHistoryEntry[]> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cp_company_history")
    .select("id,year,body,sort_order,active")
    .order("sort_order")
    .order("year");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    year: Number(r.year),
    body: String(r.body ?? ""),
    sort_order: Number(r.sort_order),
    active: Boolean(r.active),
  }));
}

export async function upsertCompanyHistoryAction(input: {
  id?: string;
  year: number;
  body: string;
  sort_order: number;
  active: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const year = Math.trunc(input.year);
  const body = input.body.trim();
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return { ok: false, error: "Neteisingi metai." };
  if (!body) return { ok: false, error: "Tekstas privalomas." };
  const admin = createSupabaseAdminClient();
  if (input.id) {
    const { error } = await admin
      .from("cp_company_history")
      .update({ year, body, sort_order: input.sort_order, active: input.active })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("cp_company_history").insert({
      year,
      body,
      sort_order: input.sort_order,
      active: input.active,
    });
    if (error) return { ok: false, error: error.message };
  }
  revalidateProposalTool();
  return { ok: true };
}

export async function deleteCompanyHistoryAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("cp_company_history").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateProposalTool();
  return { ok: true };
}

export async function setCompanyHistoryActiveAction(
  id: string,
  active: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("cp_company_history").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateProposalTool();
  return { ok: true };
}

export async function reorderCompanyHistoryAction(
  orderedIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("cp_company_history")
      .update({ sort_order: (i + 1) * 10 })
      .eq("id", orderedIds[i]);
    if (error) return { ok: false, error: error.message };
  }
  revalidateProposalTool();
  return { ok: true };
}

type PublishedTemplate = { id: string; content: CpTemplateContent };

async function loadPublishedTemplateRevision(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<PublishedTemplate> {
  const { data, error } = await admin
    .from("cp_template_revisions")
    .select("id,content")
    .eq("template_version", CP_TEMPLATE_LT_COMMERCIAL_V2)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { id: String(data.id), content: mergeTemplateContent(data.content) };

  const content = defaultTemplateContent();
  const { data: inserted, error: iErr } = await admin
    .from("cp_template_revisions")
    .insert({
      template_version: CP_TEMPLATE_LT_COMMERCIAL_V2,
      status: "published",
      content,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (iErr || !inserted) throw new Error(iErr?.message ?? "Nepavyko sukurti šablono.");
  return { id: String(inserted.id), content };
}

async function loadOrCreateDraftTemplate(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  actorId: string,
  published: PublishedTemplate
): Promise<{ id: string; content: CpTemplateContent }> {
  const { data, error } = await admin
    .from("cp_template_revisions")
    .select("id,content")
    .eq("template_version", CP_TEMPLATE_LT_COMMERCIAL_V2)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { id: String(data.id), content: mergeTemplateContent(data.content) };

  const { data: inserted, error: iErr } = await admin
    .from("cp_template_revisions")
    .insert({
      template_version: CP_TEMPLATE_LT_COMMERCIAL_V2,
      status: "draft",
      content: published.content,
      created_by: actorId,
    })
    .select("id")
    .single();
  if (iErr || !inserted) throw new Error(iErr?.message ?? "Nepavyko sukurti šablono juodraščio.");
  return { id: String(inserted.id), content: published.content };
}

export async function loadTemplateEditorData(): Promise<{
  draft: { id: string; content: CpTemplateContent };
  published: PublishedTemplate;
  history: CpCompanyHistoryEntry[];
}> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  const published = await loadPublishedTemplateRevision(admin);
  const draft = await loadOrCreateDraftTemplate(admin, actor.id, published);
  const history = await listCompanyHistoryAdmin();
  return { draft, published, history };
}

export async function saveTemplateDraftAction(
  content: CpTemplateContent
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  try {
    const published = await loadPublishedTemplateRevision(admin);
    const draft = await loadOrCreateDraftTemplate(admin, actor.id, published);
    const merged = mergeTemplateContent(content);
    const { error } = await admin.from("cp_template_revisions").update({ content: merged }).eq("id", draft.id);
    if (error) return { ok: false, error: error.message };
    revalidateProposalTool();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepavyko išsaugoti šablono." };
  }
}

export async function publishTemplateAction(
  content: CpTemplateContent
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  try {
    const merged = mergeTemplateContent(content);
    const saved = await saveTemplateDraftAction(merged);
    if (!saved.ok) return saved;
    const { error } = await admin.from("cp_template_revisions").insert({
      template_version: CP_TEMPLATE_LT_COMMERCIAL_V2,
      status: "published",
      content: merged,
      created_by: actor.id,
      published_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    revalidateProposalTool();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepavyko publikuoti šablono." };
  }
}

export async function generateTemplatePreviewPdfBytes(content?: CpTemplateContent): Promise<{
  bytes: Uint8Array;
  warnings: Array<{ path: string; message: string }>;
}> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  const template = mergeTemplateContent(content ?? (await loadPublishedTemplateRevision(admin)).content);
  const catalog = await loadCatalog(admin);
  const history = await loadHistory(admin);
  const manager =
    (await loadManagerSnapshot(admin, actor.id)) ??
    ({
      id: actor.id,
      first_name: actor.first_name,
      last_name: actor.last_name,
      display_name: displayManagerName(actor.first_name, actor.last_name, actor.email),
      job_title: "Pardavimų vadybininkas",
      email: actor.email,
      phone: actor.phone,
      avatar_url: actor.avatar_url,
    } satisfies CommercialProposalSalesManagerSnapshot);
  const snapshot = buildProposalSnapshot({
    proposalNumber: "CP-XXXX-0000",
    createdAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    templateVersion: CP_TEMPLATE_LT_COMMERCIAL_V2,
    globalDiscountPct: 0,
    discounts: ZERO_CATEGORY_DISCOUNTS,
    client: {
      client_key: "sample",
      client_id: "sample",
      company_code: null,
      name: "Pavyzdinė įmonė, UAB",
    },
    recipient: recipientFromClientFields({
      recipientType: "client",
      recipientId: "sample",
      recipientName: "Pavyzdinė įmonė, UAB",
      contactName: "Jonas Jonaitis",
      clientKey: "sample",
      clientId: "sample",
      companyCode: null,
    }),
    salesManager: manager,
    history,
    lines: catalog.map((item) => catalogItemToLineFields(item, 0)),
    template,
  });
  return generateCommercialProposalPdfV2({ snapshot, template });
}

export async function listPriceCatalogAdmin(): Promise<CpPriceItem[]> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) throw new Error("Not authorized");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cp_price_items")
    .select("id,category,sort_order,label,base_price,currency,unit,is_from_price,is_free,active")
    .order("category")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPriceItem(r as Record<string, unknown>));
}

export async function updatePriceItemAction(input: {
  id: string;
  label: string;
  basePrice: string;
  isFromPrice: boolean;
  isFree: boolean;
  active: boolean;
  sortOrder: number;
  unit: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Pavadinimas privalomas." };
  const base = input.isFree ? null : parseMoneyInput(input.basePrice);
  if (!input.isFree && base == null) return { ok: false, error: "Neteisinga kaina." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("cp_price_items")
    .update({
      label,
      base_price: base,
      is_from_price: input.isFromPrice,
      is_free: input.isFree,
      active: input.active,
      sort_order: input.sortOrder,
      unit: input.unit,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidateProposalTool();
  return { ok: true };
}
