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

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("verify-express-procurement-lead: ok");
