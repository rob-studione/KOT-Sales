/**
 * 1) NOTIFY PostgREST to reload schema (Supabase).
 * 2) Call match_project_candidates via Supabase JS (same path as the app).
 *
 * Usage: set -a && . ./.env.local && set +a && node scripts/verify-match-project-candidates.cjs
 *
 * Env: DATABASE_URL (pg NOTIFY), NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");

function dbUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || "";
}

async function notifyPgrst() {
  const url = dbUrl();
  if (!url) {
    console.warn("Skip NOTIFY: no DATABASE_URL");
    return;
  }
  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log("NOTIFY pgrst, 'reload schema' — ok");
  } finally {
    await client.end();
  }
}

async function verifyRpc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("match_project_candidates", {
    p_date_from: "2024-01-01",
    p_date_to: "2024-05-01",
    p_min_orders: 2,
    p_inactivity_days: 90,
    p_project_id: null,
  });

  if (error) {
    console.error("RPC match_project_candidates failed:", error.message, error);
    process.exit(1);
  }

  const rows = data ?? [];
  console.log("RPC match_project_candidates — ok, row count:", rows.length);
  if (rows.length > 0) {
    console.log("Sample first row keys:", Object.keys(rows[0]));
  }
}

async function main() {
  await notifyPgrst();
  await verifyRpc();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
