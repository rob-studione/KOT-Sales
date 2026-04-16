/**
 * Diagnose why a company_code might not match project candidate rules.
 * Usage: sh -c 'set -a && . ./.env.local && set +a && node scripts/debug-company-candidates.cjs 304433393'
 */
const { Client } = require("pg");

const code = process.argv[2] || "304433393";
const dateFrom = process.argv[3] || "2024-01-01";
const dateTo = process.argv[4] || "2024-04-01";
const minOrders = parseInt(process.argv[5] || "2", 10);
const inactivityDays = parseInt(process.argv[6] || "90", 10);

function dbUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || "";
}

async function main() {
  const url = dbUrl();
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows: rawRows } = await client.query(
      `
      select invoice_id, company_code, client_id, invoice_date, amount
      from public.invoices
      where trim(coalesce(company_code, '')) = $1
         or trim(coalesce(company_code, '')) ilike $2
      order by invoice_date, invoice_id
    `,
      [code, `%${code}%`]
    );

    console.log("--- Invoices matching company_code (exact or contains) ---");
    console.log("Row count:", rawRows.length);
    if (rawRows.length === 0) {
      console.log("No rows: code might be stored under client_id only, or different formatting.");
      const { rows: byClient } = await client.query(
        `select invoice_id, company_code, client_id, invoice_date from public.invoices where client_id = $1 limit 20`,
        [code]
      );
      console.log("Try client_id = code:", byClient.length, "rows");
      if (byClient.length) console.table(byClient);
      return;
    }

    const k =
      rawRows[0].company_code != null && String(rawRows[0].company_code).trim() !== ""
        ? String(rawRows[0].company_code).trim()
        : rawRows[0].client_id
          ? String(rawRows[0].client_id)
          : "";

    console.log("Inferred client_key (coalesce pattern):", JSON.stringify(k));

    const inRange = rawRows.filter((r) => {
      const d = r.invoice_date;
      const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      return s >= dateFrom && s <= dateTo;
    });

    const lastAny = rawRows.reduce((max, r) => {
      const d = r.invoice_date;
      const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      return s > max ? s : max;
    }, "1970-01-01");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactivityDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const inactiveOk = lastAny < cutoffStr;

    console.log("\n--- Rule checks (same as match_project_candidates) ---");
    console.log("Interval:", dateFrom, "…", dateTo);
    console.log("Invoices in interval:", inRange.length, "(need >=", minOrders + ")");
    console.log("Last invoice anywhere:", lastAny);
    console.log("Inactivity cutoff (today -", inactivityDays, "d):", cutoffStr);
    console.log("Passes inactivity (last_any < cutoff)?", inactiveOk);

    if (inRange.length < minOrders) {
      console.log("\n>> FAIL: not enough invoices in historical interval.");
    }
    if (!inactiveOk) {
      console.log("\n>> FAIL: last invoice is too recent for inactivity rule.");
    }
    if (inRange.length >= minOrders && inactiveOk) {
      console.log("\n>> Would qualify on invoice data alone — if still missing, check RPC client_key vs duplicates or open work_items.");
    }

    const { rows: rpcTest } = await client.query(
      `select * from public.match_project_candidates($1::date, $2::date, $3::int, $4::int, null::uuid)`,
      [dateFrom, dateTo, minOrders, inactivityDays]
    );
    const hit = rpcTest.filter((r) => String(r.client_key) === k || String(r.company_code) === code);
    console.log("\n--- RPC match_project_candidates (p_project_id null) ---");
    console.log("Total RPC rows:", rpcTest.length);
    console.log("This client_key in RPC result?", hit.length > 0, hit.length ? hit[0] : null);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
