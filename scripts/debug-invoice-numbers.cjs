const { Client } = require("pg");

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";
const nums = [20374, 21469, 21515, 21525];
const companyCode = "304433393";

async function main() {
  const c = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    const { rows } = await c.query(
      `
      select invoice_id, invoice_number, series_title, series_number, company_code, client_id, invoice_date, amount
      from public.invoices
      where series_number = any($1::int[])
        and (series_title is not null and trim(series_title) ilike 'VK-000')
      order by series_number
    `,
      [nums]
    );
    console.log("=== VK-000 + series_number in", nums.join(", "), "===");
    console.table(rows);

    const { rows: byStored } = await c.query(
      `
      select invoice_id, invoice_number, series_title, series_number, company_code, client_id, invoice_date
      from public.invoices
      where invoice_number ilike any (array['%20374%', '%21469%', '%21515%', '%21525%'])
      order by invoice_date
    `
    );
    console.log("\n=== invoice_number contains those numbers ===");
    console.table(byStored);

    const { rows: allCo } = await c.query(
      `
      select invoice_id, invoice_number, series_title, series_number, company_code, client_id, invoice_date
      from public.invoices
      where trim(coalesce(company_code, '')) = $1
      order by invoice_date
    `,
      [companyCode]
    );
    console.log("\n=== All invoices for company_code", companyCode, "===", allCo.length);
    console.table(allCo);

    const inWin = allCo.filter((r) => {
      const s = r.invoice_date instanceof Date ? r.invoice_date.toISOString().slice(0, 10) : String(r.invoice_date).slice(0, 10);
      return s >= "2024-01-01" && s <= "2024-04-01";
    });
    console.log("\n=== Same company, invoices in 2024-01-01 .. 2024-04-01 ===", inWin.length);
    console.table(inWin);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
