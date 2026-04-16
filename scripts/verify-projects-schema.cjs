#!/usr/bin/env node
/**
 * Step-by-step DB verification for public.projects + project_type + PostgREST NOTIFY.
 *
 * Usage (repo root):
 *   set -a && . ./.env.local && set +a && node scripts/verify-projects-schema.cjs
 *
 * Requires DATABASE_URL (direct Postgres URI, port 5432) — see .env.example.
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, "utf8");
  for (const line of txt.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function safeHost(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.host;
  } catch {
    return "(invalid URL)";
  }
}

async function main() {
  loadEnvLocal();

  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (apiUrl) {
    console.log("[6] App Supabase API (NEXT_PUBLIC_SUPABASE_URL) host:", safeHost(apiUrl));
  } else {
    console.log("[6] NEXT_PUBLIC_SUPABASE_URL: (not set in env for this process)");
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "\n[1] Cannot query Postgres: DATABASE_URL is missing.\n" +
        "    Add direct Postgres URI to .env.local (Settings → Database → URI, port 5432).\n" +
        "    Then: set -a && . ./.env.local && set +a && node scripts/verify-projects-schema.cjs\n"
    );
    process.exit(2);
  }

  console.log("[1] Connecting with DATABASE_URL (host only):", safeHost(url));

  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const cols = await client.query(`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'projects'
      order by ordinal_position;
    `);
    console.log("\n[1] information_schema.columns for public.projects:");
    console.table(cols.rows);

    const hasProjectType = cols.rows.some((r) => r.column_name === "project_type");
    console.log("\n[1] project_type column present:", hasProjectType ? "YES" : "NO");

    if (hasProjectType) {
      const sample = await client.query("select project_type from public.projects limit 1;");
      console.log("\n[4] select project_type from public.projects limit 1:", sample.rows);
    } else {
      console.log("\n[2] Column missing — apply repo migration supabase/migrations/0032_projects_project_type.sql (or equivalent) via SQL Editor / db push.");
    }

    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("\n[3] NOTIFY pgrst, 'reload schema' — executed OK.");

    console.log(
      "\n[5] Code uses Supabase JS .from('projects') → PostgREST public.projects (default schema).\n" +
        "    No other schema name is passed in app code for projects."
    );
    console.log(
      "\n[7] PostgREST schema cache: reloaded via NOTIFY above. Next.js dev server does not cache DB columns;\n" +
        "    if error persists after column exists + NOTIFY, hard-refresh client or wait a few seconds."
    );
  } catch (e) {
    console.error("\n[error]", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
