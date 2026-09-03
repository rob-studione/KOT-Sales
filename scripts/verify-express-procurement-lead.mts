#!/usr/bin/env node
/**
 * Express procurement → lead classification + idempotent ensure.
 * No live DB.
 *
 *   node --import ./scripts/register-ts-path.mjs --experimental-strip-types scripts/verify-express-procurement-lead.mts
 */

import {
  classifyExpressProcurementRecipient,
  normalizeExpressCompanyCode,
  pendingLeadFromProcurement,
} from "@/lib/crm/expressProcurementRecipient";
import { ensureManualLeadByCompanyCode, manualLeadInsertPayload } from "@/lib/crm/manualLeadEnsure";
import {
  mergeProposalRecipientSearchResults,
  type ProposalRecipientSearchRow,
} from "@/lib/crm/proposalRecipientSearch";
import { previewCatalogPrices } from "@/lib/commercialProposal/catalogPreview";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import type { CpPriceItem } from "@/lib/commercialProposal/types";
import { isKanbanWorkActionType } from "@/lib/crm/projectBoardConstants";
import { defaultPricingGroup, mapPricingGroup } from "@/lib/crm/pricingGroups";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  }
}

const eko = classifyExpressProcurementRecipient({
  hasCrmClient: false,
  hasExistingLead: false,
  organizationName: 'Viešoji įstaiga "Ekoagros"',
  organizationCode: "259925770",
});
assert(eko.kind === "pending_lead", "Ekoagros without CRM is pending lead, not blocked");

const crm = classifyExpressProcurementRecipient({
  hasCrmClient: true,
  hasExistingLead: false,
  organizationName: "AB Lietuvos geležinkeliai",
  organizationCode: "110053842",
});
assert(crm.kind === "client" && crm.matchedBy === "company_code", "CRM match stays KLIENTAS");

const existing = classifyExpressProcurementRecipient({
  hasCrmClient: false,
  hasExistingLead: true,
  organizationName: 'Viešoji įstaiga "Ekoagros"',
  organizationCode: "259925770",
});
assert(existing.kind === "existing_lead" && existing.matchedBy === "company_code", "existing lead reused by company_code");

const noCode = classifyExpressProcurementRecipient({
  hasCrmClient: false,
  hasExistingLead: false,
  organizationName: "Be kodo",
  organizationCode: null,
});
assert(noCode.kind === "blocked", "missing company code blocks");

const noName = classifyExpressProcurementRecipient({
  hasCrmClient: false,
  hasExistingLead: false,
  organizationName: null,
  organizationCode: "259925770",
});
assert(noName.kind === "blocked", "missing organization name blocks");

const clientWithoutName = classifyExpressProcurementRecipient({
  hasCrmClient: true,
  hasExistingLead: false,
  organizationName: null,
  organizationCode: "110053842",
});
assert(clientWithoutName.kind === "client", "CRM client wins even without procurement name");

assert(normalizeExpressCompanyCode(" 259 925 770 ") === "259925770", "company code normalized without spaces");

const pending = pendingLeadFromProcurement({
  organizationName: 'Viešoji įstaiga "Ekoagros"',
  organizationCode: "259925770",
});
assert(pending.companyCode === "259925770" && pending.email === null, "pending lead has code and optional empty email");

const payload = manualLeadInsertPayload({
  projectId: "11111111-1111-1111-1111-111111111111",
  companyName: 'Viešoji įstaiga "Ekoagros"',
  companyCode: "259925770",
});
assert(payload.crm_status === "new_lead", "insert uses createManualProjectLeadAction crm_status");
assert(payload.company_code === "259925770", "insert stores normalized company_code");
assert(payload.email === null && payload.last_order_at === null, "email optional, last_order_at null");

type LeadRow = { id: string; project_id: string; company_code: string };
const leads: LeadRow[] = [];
let insertCalls = 0;

function mockFrom() {
  return {
    select() {
      return this;
    },
    eq(col: string, value: string) {
      this._filters = { ...(this._filters ?? {}), [col]: value };
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle() {
      const f = this._filters ?? {};
      const found = leads.find((row) => {
        if (f.company_code && row.company_code !== f.company_code) return false;
        if (f.project_id && row.project_id !== f.project_id) return false;
        return true;
      });
      return Promise.resolve({ data: found ? { id: found.id } : null, error: null });
    },
    insert(row: { project_id: string; company_code: string }) {
      insertCalls += 1;
      const dup = leads.find((l) => l.project_id === row.project_id && l.company_code === row.company_code);
      if (dup) {
        return {
          select() {
            return this;
          },
          single() {
            return Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            });
          },
        };
      }
      const created = {
        id: `lead-${leads.length + 1}`,
        project_id: row.project_id,
        company_code: row.company_code,
      };
      leads.push(created);
      return {
        select() {
          return this;
        },
        single() {
          return Promise.resolve({ data: { id: created.id }, error: null });
        },
      };
    },
    _filters: {} as Record<string, string>,
  };
}

const supabase = { from: () => mockFrom() } as never;
const input = {
  projectId: "11111111-1111-1111-1111-111111111111",
  companyName: 'Viešoji įstaiga "Ekoagros"',
  companyCode: "259925770",
};

const first = await ensureManualLeadByCompanyCode(supabase, input);
const second = await ensureManualLeadByCompanyCode(supabase, input);
assert(first.created && first.id === "lead-1", "first prepare creates one lead");
assert(!second.created && second.id === first.id, "second prepare reuses the same lead id");
assert(leads.length === 1, "no second lead row");

const racedA = ensureManualLeadByCompanyCode(supabase, {
  projectId: "22222222-2222-2222-2222-222222222222",
  companyName: "Kita",
  companyCode: "111111111",
});
const racedB = ensureManualLeadByCompanyCode(supabase, {
  projectId: "22222222-2222-2222-2222-222222222222",
  companyName: "Kita",
  companyCode: "111111111",
});
const [a, b] = await Promise.all([racedA, racedB]);
assert(a.id === b.id, "parallel ensure returns the same lead id");
assert(leads.filter((l) => l.company_code === "111111111").length === 1, "parallel ensure inserts at most one row");
assert(insertCalls >= 2, "conflict path exercised or second call saw the first row");

const otherProject = await ensureManualLeadByCompanyCode(supabase, {
  projectId: "33333333-3333-3333-3333-333333333333",
  companyName: 'Viešoji įstaiga "Ekoagros"',
  companyCode: "259925770",
});
assert(otherProject.created && otherProject.id !== first.id, "same company code in another project creates a separate lead");
assert(leads.filter((l) => l.company_code === "259925770").length === 2, "leads are scoped to project_id, not global");

const courtWork: ProposalRecipientSearchRow = {
  recipientType: "lead",
  recipientId: "wi-1",
  recipientName: "Regionų apygardos administracinis teismas",
  companyCode: "188734347",
  workItemId: "wi-1",
};
const mergedFound = mergeProposalRecipientSearchResults({
  clients: [],
  leads: [],
  workItems: [courtWork],
});
assert(mergedFound.length === 1 && mergedFound[0]?.workItemId === "wi-1", "Kanban company appears when no CRM/lead row");

const mergedClientWins = mergeProposalRecipientSearchResults({
  clients: [
    {
      recipientType: "client",
      recipientId: "c1",
      recipientName: "Teismas",
      companyCode: "188734347",
    } satisfies ProposalRecipientSearchRow,
  ],
  leads: [],
  workItems: [courtWork],
});
assert(mergedClientWins.length === 1 && mergedClientWins[0]?.recipientType === "client", "CRM client hides same-code Kanban row");

const mergedLeadWins = mergeProposalRecipientSearchResults({
  clients: [],
  leads: [
    {
      recipientType: "lead",
      recipientId: "lead-x",
      recipientName: "Teismas",
      companyCode: "188734347",
      projectId: "other",
    } satisfies ProposalRecipientSearchRow,
  ],
  workItems: [courtWork],
});
assert(mergedLeadWins.length === 1 && mergedLeadWins[0]?.recipientId === "lead-x", "existing lead from any project hides Kanban duplicate");

assert(isKanbanWorkActionType("call"), "call is Kanban work");
assert(isKanbanWorkActionType("email"), "email is Kanban work");
assert(isKanbanWorkActionType("commercial"), "commercial is Kanban work");
assert(isKanbanWorkActionType("status_change"), "status_change is Kanban work");
assert(!isKanbanWorkActionType("picked"), "picked is not Kanban work");
assert(!isKanbanWorkActionType("note"), "note is not Kanban work");
assert(!isKanbanWorkActionType("returned_to_candidates"), "return to candidates is not Kanban work");

const sampleItem: CpPriceItem = {
  id: "p1",
  category: "translation",
  sort_order: 0,
  label: "Bendrinė",
  base_price: 10.8,
  currency: "EUR",
  unit: "std. psl.",
  is_from_price: true,
  is_free: false,
  active: true,
};
const preview = previewCatalogPrices(
  [
    sampleItem,
    { ...sampleItem, id: "p2", base_price: 12, is_from_price: false },
    { ...sampleItem, id: "p3", category: "ai_translation", base_price: 20, is_from_price: false },
    { ...sampleItem, id: "p4", category: "additional_service", active: false, base_price: 5 },
    { ...sampleItem, id: "p5", category: "additional_service", is_free: true, base_price: null },
  ],
  { translation: 3, ai_translation: 0, additional_service: 10 }
);
assert(preview[0]?.isFrom === true, "mixed from-price marks translation as nuo");
assert(preview[0]?.minBase === 10.8, "translation uses lowest base");
assert(preview[0]?.minAfter === applyGlobalDiscount(10.8, 3), "translation applies 3%");
assert(preview[1]?.minAfter === 20, "AI with 0% stays at base");
assert(preview[2]?.count === 0 && preview[2]?.minBase === null, "inactive and free additional services are skipped");

const groups = [
  mapPricingGroup({
    id: "g1",
    name: "Įstaigos",
    sort_order: 1,
    active: true,
    is_default: false,
    translation_pct: 3,
    ai_translation_pct: 3,
    additional_service_pct: 3,
  }),
  mapPricingGroup({
    id: "g2",
    name: "Privačios įmonės",
    sort_order: 0,
    active: true,
    is_default: true,
    translation_pct: 0,
    ai_translation_pct: 0,
    additional_service_pct: 0,
  }),
];
assert(defaultPricingGroup(groups)?.id === "g2", "default group is preferred over first active");
assert(groups[0]?.discounts.translation === 3, "mapPricingGroup reads category percents");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("verify-express-procurement-lead: ok");
