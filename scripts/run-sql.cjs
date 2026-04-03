/**
 * Run a .sql file against Postgres using DATABASE_URL (or SUPABASE_DB_URL / POSTGRES_URL).
 * Use the direct database URI (port 5432), not the Supavisor transaction pooler (6543), for DDL.
 *
 * Usage: node scripts/run-sql.cjs path/to/file.sql
 * Env:   load .env.local first, e.g. `set -a && . ./.env.local && set +a && node scripts/run-sql.cjs ...`
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function connectionUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

async function main() {
  const url = connectionUrl();
  if (!url) {
    console.error(
      "Missing DATABASE_URL (or SUPABASE_DB_URL / POSTGRES_URL). " +
        "In Supabase: Project Settings → Database → Connection string → URI (direct, port 5432)."
    );
    process.exit(1);
  }

  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: node scripts/run-sql.cjs <path-to.sql>");
    process.exit(1);
  }

  const sqlPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(sqlPath)) {
    console.error("File not found:", sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied:", sqlPath);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  if (/pooler|PgBouncer|transaction mode/i.test(String(e.message))) {
    console.error(
      "\nHint: DDL often fails through the transaction pooler. Use the direct Postgres connection (port 5432) URI."
    );
  }
  process.exit(1);
});
