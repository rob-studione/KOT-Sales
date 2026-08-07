/**
 * Smoke-test SSR-like waterfall against production Supabase.
 * Usage: set -a && . ./.env.local && set +a && node scripts/perf-ssr-waterfall.mjs
 *
 * Measures sequential round-trips that a project tab switch typically pays.
 * Does not include Vercel↔client latency; compares DB hop cost from this machine.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectId = process.argv[2] || "24239d13-215b-412b-b8b2-e48b1adafca6";

if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function timed(label, fn) {
  const t0 = Date.now();
  const out = await fn();
  const ms = Date.now() - t0;
  const err = out?.error ? String(out.error.message || out.error).slice(0, 120) : null;
  console.log(`${String(ms).padStart(5)}ms  ${label}${err ? `  ERR ${err}` : ""}`);
  return { ms, out };
}

async function main() {
  console.log(`Project: ${projectId}`);
  console.log("--- sequential (old-style tab shell) ---");
  let seq = 0;
  seq += (await timed("auth.getUser (approx via projects ping)", async () =>
    supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  )).ms;
  seq += (await timed("projects + crm_users", async () => {
    const [a, b] = await Promise.all([
      supabase.from("projects").select("id,name,project_type").eq("id", projectId).maybeSingle(),
      supabase.from("crm_users").select("id,name").order("name").limit(50),
    ]);
    return { error: a.error || b.error };
  })).ms;
  seq += (await timed("crm_users maybeSingle (current user)", async () =>
    supabase.from("crm_users").select("id,role").limit(1).maybeSingle()
  )).ms;
  seq += (await timed("project_overview_analytics", async () =>
    supabase.rpc("project_overview_analytics", {
      p_project_id: projectId,
      p_from: "2026-08-01",
      p_to: "2026-08-07",
    })
  )).ms;
  seq += (await timed("project_revenue_feed", async () =>
    supabase.rpc("project_revenue_feed", {
      p_project_id: projectId,
      p_from: "2026-07-01",
      p_to: "2026-08-07",
      p_include_rows: false,
    })
  )).ms;
  console.log(`SEQ TOTAL: ${seq}ms`);

  console.log("--- parallel shell (project+user together, then analytics) ---");
  let par = 0;
  par += (await timed("auth/session ping", async () =>
    supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  )).ms;
  par += (await timed("Promise.all project+users+overview", async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("projects").select("id,name,project_type").eq("id", projectId).maybeSingle(),
      supabase.from("crm_users").select("id,name").order("name").limit(50),
      supabase.rpc("project_overview_analytics", {
        p_project_id: projectId,
        p_from: "2026-08-01",
        p_to: "2026-08-07",
      }),
    ]);
    return { error: a.error || b.error || c.error };
  })).ms;
  console.log(`PAR TOTAL: ${par}ms`);

  console.log("--- heavy tabs ---");
  await timed("match_project_candidates_page (kandidatai)", async () =>
    supabase.rpc("match_project_candidates_page", {
      p_date_from: "2020-01-01",
      p_date_to: "2026-08-07",
      p_min_orders: 1,
      p_inactivity_days: 90,
      p_project_id: projectId,
      p_require_business_id: true,
      p_sort: "revenue_desc",
      p_limit: 20,
      p_offset: 0,
      p_search: null,
    })
  );
  await timed("open work items count (darbas-ish)", async () =>
    supabase
      .from("project_work_items")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
  );

  console.log("\nNote: if Vercel functions run in iad1 while DB is eu-central-1,");
  console.log("multiply hop count by ~100-150ms extra RTT vs local EU.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
