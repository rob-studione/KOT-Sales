"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";
import { displayClientName } from "@/lib/crm/format";
import { generateCommercialProposalPdf } from "@/lib/commercialProposal/generatePdf";
import { applyGlobalDiscount, parseMoneyInput, roundMoney } from "@/lib/commercialProposal/money";
import {
  buildProposalSnapshot,
  catalogItemToLineFields,
  displayManagerName,
  recalculateLine,
} from "@/lib/commercialProposal/snapshot";
import { CP_TEMPLATE_LT_COMMERCIAL_V1 } from "@/lib/commercialProposal/types";
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
  return Boolean(user && hasPermission(user, "nav.clients"));
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
    currency: String(row.currency ?? "EUR"),
    unit: row.unit == null ? null : String(row.unit),
  };
}

function mapProposal(row: Record<string, unknown>): CommercialProposalRow {
  return {
    id: String(row.id),
    proposal_number: row.proposal_number == null ? null : String(row.proposal_number),
    status: String(row.status ?? "draft") as CommercialProposalStatus,
    template_version: String(row.template_version ?? CP_TEMPLATE_LT_COMMERCIAL_V1),
    client_key: String(row.client_key ?? ""),
    client_id: row.client_id == null ? null : String(row.client_id),
    company_code: row.company_code == null ? null : String(row.company_code),
    client_name: String(row.client_name ?? ""),
    sales_manager_id: row.sales_manager_id == null ? null : String(row.sales_manager_id),
    global_discount_pct: toNum(row.global_discount_pct) ?? 0,
    created_by: row.created_by == null ? null : String(row.created_by),
    generated_at: row.generated_at == null ? null : String(row.generated_at),
    pdf_storage_path: row.pdf_storage_path == null ? null : String(row.pdf_storage_path),
    snapshot: (row.snapshot as CommercialProposalSnapshot | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function loadClientSummary(admin: ReturnType<typeof createSupabaseAdminClient>, clientId: string) {
  const segment = decodeURIComponent(clientId);
  const { data, error } = await admin
    .from("v_client_list_from_invoices")
    .select("client_key,company_code,client_id,company_name")
    .eq("client_id", segment)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    client_key: String(data.client_key ?? ""),
    client_id: data.client_id == null ? null : String(data.client_id),
    company_code: data.company_code == null ? null : String(data.company_code),
    name: displayClientName(String(data.company_name ?? ""), data.company_code == null ? null : String(data.company_code)),
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
      "id,proposal_id,category,catalog_item_id,sort_order,label,base_price,calculated_price,final_price,is_manual_override,is_from_price,is_free,currency,unit"
    )
    .eq("proposal_id", proposalId)
    .order("category")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapLine(r as Record<string, unknown>));
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

export async function createCommercialProposalAction(formData: FormData): Promise<void> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) throw new Error("Not authorized");
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Nenurodytas klientas.");

  const admin = createSupabaseAdminClient();
  const client = await loadClientSummary(admin, clientId);
  if (!client) throw new Error("Klientas nerastas.");

  const catalog = await loadCatalog(admin);
  const { data: inserted, error } = await admin
    .from("commercial_proposals")
    .insert({
      status: "draft",
      template_version: CP_TEMPLATE_LT_COMMERCIAL_V1,
      client_key: client.client_key,
      client_id: client.client_id,
      company_code: client.company_code,
      client_name: client.name,
      sales_manager_id: actor.id,
      global_discount_pct: 0,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Nepavyko sukurti pasiūlymo.");

  const lines = catalog.map((item) => ({
    proposal_id: inserted.id,
    ...catalogItemToLineFields(item, 0),
  }));
  if (lines.length) {
    const { error: lErr } = await admin.from("commercial_proposal_lines").insert(lines);
    if (lErr) throw new Error(lErr.message);
  }

  revalidatePath(`/klientai/${encodeURIComponent(clientId)}`);
  redirect(`/klientai/${encodeURIComponent(clientId)}/pasiulymai/${inserted.id}`);
}

export type ProposalEditorPayload = {
  proposal: CommercialProposalRow;
  lines: CommercialProposalLine[];
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
  const lines = proposal.snapshot?.lines
    ? proposal.snapshot.lines.map((l, i) => ({
        id: `snap-${i}`,
        proposal_id: proposal.id,
        ...l,
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
    managers,
    canChangeManager: hasPermission(actor, "settings.accounts") || hasPermission(actor, "settings.commercial_proposals") || true,
  };
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
  return (data ?? []).map((row) => {
    const p = mapProposal(row as Record<string, unknown>);
    return {
      ...p,
      manager_name: p.sales_manager_id ? names.get(p.sales_manager_id) ?? null : null,
    };
  });
}

export async function updateProposalSettingsAction(input: {
  proposalId: string;
  globalDiscountPct: number;
  salesManagerId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("commercial_proposals")
    .select("id,status,client_id")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Pasiūlymas nerastas." };
  if (String(row.status) !== "draft") return { ok: false, error: "Keisti galima tik juodraštį." };

  const discount = roundMoney(Math.min(100, Math.max(0, input.globalDiscountPct)));
  const { error: uErr } = await admin
    .from("commercial_proposals")
    .update({ global_discount_pct: discount, sales_manager_id: input.salesManagerId })
    .eq("id", input.proposalId);
  if (uErr) return { ok: false, error: uErr.message };

  const lines = await loadLines(admin, input.proposalId);
  for (const line of lines) {
    const next = recalculateLine(line, discount);
    const { error: lErr } = await admin
      .from("commercial_proposal_lines")
      .update({ calculated_price: next.calculated_price, final_price: next.final_price })
      .eq("id", line.id);
    if (lErr) return { ok: false, error: lErr.message };
  }

  revalidatePath(`/klientai/${encodeURIComponent(String(row.client_id ?? ""))}/pasiulymai/${input.proposalId}`);
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
  const calculated =
    mapped.is_free || mapped.base_price == null
      ? null
      : applyGlobalDiscount(mapped.base_price, toNum(proposal.global_discount_pct) ?? 0);
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
  return buildProposalSnapshot({
    proposalNumber,
    createdAt: proposal.created_at,
    generatedAt,
    templateVersion: proposal.template_version,
    globalDiscountPct: proposal.global_discount_pct,
    client: {
      client_key: proposal.client_key,
      client_id: proposal.client_id,
      company_code: proposal.company_code,
      name: proposal.client_name,
    },
    salesManager: manager,
    history,
    lines: lines.map(({ id: _id, proposal_id: _pid, ...rest }) => rest),
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

    const clientSeg = proposal.client_id ?? "";
    revalidatePath(`/klientai/${encodeURIComponent(clientSeg)}`);
    revalidatePath(`/klientai/${encodeURIComponent(clientSeg)}/pasiulymai/${proposal.id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepavyko sugeneruoti PDF." };
  }
}

export async function duplicateCommercialProposalAction(
  proposalId: string
): Promise<{ ok: true; id: string; clientId: string } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canUseProposals(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("commercial_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "Pasiūlymas nerastas." };
  const source = mapProposal(data as Record<string, unknown>);
  const sourceLines =
    source.snapshot?.lines?.map((l, i) => ({
      id: `snap-${i}`,
      proposal_id: source.id,
      ...l,
    })) ?? (await loadLines(admin, source.id));

  const { data: inserted, error: iErr } = await admin
    .from("commercial_proposals")
    .insert({
      status: "draft",
      template_version: source.template_version,
      client_key: source.client_key,
      client_id: source.client_id,
      company_code: source.company_code,
      client_name: source.client_name,
      sales_manager_id: source.sales_manager_id ?? actor.id,
      global_discount_pct: source.global_discount_pct,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (iErr || !inserted) return { ok: false, error: iErr?.message ?? "Nepavyko dubliuoti." };

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
    currency: l.currency,
    unit: l.unit,
  }));
  if (lines.length) {
    const { error: lErr } = await admin.from("commercial_proposal_lines").insert(lines);
    if (lErr) return { ok: false, error: lErr.message };
  }

  const clientId = source.client_id ?? "";
  revalidatePath(`/klientai/${encodeURIComponent(clientId)}`);
  return { ok: true, id: inserted.id, clientId };
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
  revalidatePath(`/klientai/${encodeURIComponent(String(data.client_id ?? ""))}`);
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
  revalidatePath("/nustatymai/komerciniai-pasiulymai");
  return { ok: true };
}

export async function deleteCompanyHistoryAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canAdminCatalog(actor) || !actor) return { ok: false, error: "Neturite teisių." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("cp_company_history").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/nustatymai/komerciniai-pasiulymai");
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
  revalidatePath("/nustatymai/komerciniai-pasiulymai");
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
  revalidatePath("/nustatymai/komerciniai-pasiulymai");
  return { ok: true };
}
