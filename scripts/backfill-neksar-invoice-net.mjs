/**
 * Backfill invoices.amount_net / tax_* from Neksar (subtotal / taxAmount / taxRate).
 * Updates by Neksar invoice_id; if no row, also by invoice_number (imported Saskaita123).
 *
 * Usage:
 *   set -a && . ./.env.local && set +a && node scripts/backfill-neksar-invoice-net.mjs
 *   DRY_RUN=true ISSUED_FROM=2026-01-01 MAX_PAGES=3 node scripts/backfill-neksar-invoice-net.mjs
 */
const baseUrl = (process.env.NEKSAR_API_BASE_URL || "https://clouds.kingsoftranslation.com").replace(/\/$/, "");
const apiKey = process.env.NEKSAR_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const billingEntityId = process.env.NEKSAR_BILLING_ENTITY_ID || "cmokpmdqi0001bmzhcpctahsq";
const issuedFrom = process.env.ISSUED_FROM || "2025-01-01";
const maxPages = Number(process.env.MAX_PAGES || 200);
const dryRun = process.env.DRY_RUN === "true";

if (!apiKey || !supabaseUrl || !serviceKey) {
  console.error("Missing NEKSAR_API_KEY / SUPABASE URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function asNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function resolveNet({ total, subtotal, taxAmount, taxRate }) {
  if (subtotal != null) return round2(subtotal);
  if (taxAmount != null) return round2(total - taxAmount);
  if (taxRate === 0) return round2(total);
  if (taxRate != null && taxRate > 0) return round2(total / (1 + taxRate / 100));
  return null;
}

async function fetchPage(page) {
  const u = new URL(`${baseUrl}/api/external/v1/client-invoices`);
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", "100");
  u.searchParams.set("status", "SENT,PAID,OVERDUE");
  u.searchParams.set("billingEntityId", billingEntityId);
  u.searchParams.set("issuedFrom", issuedFrom);
  const res = await fetch(u, { headers: { "X-API-KEY": apiKey, Accept: "application/json" } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Neksar ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function rest(path, { method = "GET", body } = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "count=exact" : "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

function parseNeksarNumber(raw) {
  const s = (raw ?? "").trim();
  if (!s) return { seriesTitle: null, seriesNumber: null };
  const m = s.match(/^(.*?)(\d+)\s*$/);
  if (!m) return { seriesTitle: s, seriesNumber: null };
  const title = m[1].trim();
  const n = parseInt(m[2], 10);
  return {
    seriesTitle: title.length > 0 ? title : null,
    seriesNumber: Number.isFinite(n) ? n : null,
  };
}

function seriesLetters(seriesTitle) {
  const m = (seriesTitle ?? "").match(/[A-Za-z]+/);
  return m ? m[0].toUpperCase() : "";
}

async function applyNetFields({ invoiceId, invoiceNumber, seriesNumber, seriesTitle, patch }) {
  let rows = await rest(`invoices?invoice_id=eq.${encodeURIComponent(invoiceId)}`, {
    method: "PATCH",
    body: patch,
  });
  if (Array.isArray(rows) && rows.length > 0) return { via: "id", count: rows.length };

  if (invoiceNumber) {
    rows = await rest(`invoices?invoice_number=eq.${encodeURIComponent(invoiceNumber)}`, {
      method: "PATCH",
      body: patch,
    });
    if (Array.isArray(rows) && rows.length > 0) return { via: "number", count: rows.length };
  }

  // Saskaita123 vs Neksar: VK-29739 vs VK-00029739 — match by series_number + letter prefix.
  if (seriesNumber != null) {
    const letters = seriesLetters(seriesTitle);
    const filter = letters
      ? `series_number=eq.${seriesNumber}&series_title=ilike.${encodeURIComponent(`${letters}%`)}`
      : `series_number=eq.${seriesNumber}`;
    rows = await rest(`invoices?${filter}`, {
      method: "PATCH",
      body: patch,
    });
    if (Array.isArray(rows) && rows.length > 0) return { via: "series", count: rows.length };
  }

  return { via: null, count: 0 };
}

async function main() {
  let page = 1;
  let totalPages = 1;
  let scanned = 0;
  let candidates = 0;
  let updated = 0;
  let updatedViaNumber = 0;
  let updatedViaSeries = 0;
  let missingInDb = 0;
  let skippedImportedApi = 0;
  let skippedOther = 0;
  let zeroRate = 0;
  const samples = [];

  while (page <= totalPages && page <= maxPages) {
    const json = await fetchPage(page);
    const rows = Array.isArray(json.data) ? json.data : [];
    totalPages = json.pagination?.totalPages ?? page;
    console.log(`page ${page}/${totalPages} rows=${rows.length}`);

    for (const inv of rows) {
      scanned += 1;
      // Include imported API rows for number-based enrich (CRM may still hold Saskaita123 id).
      if (String(inv.docType || "").toUpperCase() !== "STANDARD") {
        skippedOther += 1;
        continue;
      }
      if (inv.importedAt != null) skippedImportedApi += 1;

      const currency = String(inv.currency || "EUR").toUpperCase();
      if (currency !== "EUR") {
        skippedOther += 1;
        continue;
      }
      const invoiceId = inv.id != null ? String(inv.id) : null;
      const invoiceNumber = inv.number != null ? String(inv.number).trim() : null;
      const { seriesTitle, seriesNumber } = parseNeksarNumber(invoiceNumber);
      const total = asNumber(inv.total);
      if (!invoiceId || total == null) {
        skippedOther += 1;
        continue;
      }
      const tax_amount = asNumber(inv.taxAmount);
      const tax_rate = asNumber(inv.taxRate);
      const amount_net = resolveNet({
        total,
        subtotal: asNumber(inv.subtotal),
        taxAmount: tax_amount,
        taxRate: tax_rate,
      });
      if (amount_net == null) {
        skippedOther += 1;
        continue;
      }
      if (tax_rate === 0) zeroRate += 1;
      candidates += 1;
      if (samples.length < 10) {
        samples.push({ number: invoiceNumber, total, amount_net, tax_rate, tax_amount, importedAt: inv.importedAt ?? null });
      }

      if (dryRun) continue;

      const patch = { amount_net, tax_amount, tax_rate };
      const result = await applyNetFields({
        invoiceId,
        invoiceNumber,
        seriesNumber,
        seriesTitle,
        patch,
      });
      if (result.count > 0) {
        updated += result.count;
        if (result.via === "number") updatedViaNumber += result.count;
        if (result.via === "series") updatedViaSeries += result.count;
      } else {
        missingInDb += 1;
      }
    }
    page += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        issuedFrom,
        scanned,
        candidates,
        updated,
        updatedViaNumber,
        updatedViaSeries,
        missingInDb,
        skippedImportedApi,
        skippedOther,
        zeroRate,
        samples,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
