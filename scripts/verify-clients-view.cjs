/**
 * Verify v_client_list_from_invoices exists via SQL and (optionally) Supabase REST.
 *
 * Usage: same env as run-sql.cjs (DATABASE_URL + optional NEXT_PUBLIC_SUPABASE_* for REST check)
 */

const { Client } = require("pg");

function connectionUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || "";
}

async function main() {
  const url = connectionUrl();
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
    const { rows } = await client.query(`
      select
        to_regclass('public.v_client_list_from_invoices') is not null as view_exists,
        exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'recent_invoices_for_clients'
        ) as rpc_exists;
    `);
    const row = rows[0];
    console.log("Postgres check:", row);
    if (!row.view_exists || !row.rpc_exists) {
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (base && key && typeof fetch === "function") {
    const u = `${base.replace(/\/$/, "")}/rest/v1/v_client_list_from_invoices?select=client_key&limit=1`;
    const res = await fetch(u, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    console.log("REST /v_client_list_from_invoices:", res.status, res.ok ? "OK" : text.slice(0, 200));
    if (!res.ok) process.exit(1);
  } else {
    console.log("REST check skipped (set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY to verify PostgREST cache).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
