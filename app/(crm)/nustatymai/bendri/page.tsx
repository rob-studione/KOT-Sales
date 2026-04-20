import { requireAdmin } from "@/lib/crm/currentUser";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { updateGlobalSettingsAction } from "@/lib/crm/crmSettingsActions";
import { getPublicBuildInfo } from "@/lib/buildInfo";

export const dynamic = "force-dynamic";

type GlobalSettings = {
  timezone: string;
  language: string;
};

export default async function BendriSettingsPage() {
  await requireAdmin({ mode: "redirect", redirectTo: "/dashboard" });

  const supabase = await createSupabaseSsrReadOnlyClient();
  const [{ data: gs }, { data: auth }] = await Promise.all([
    supabase.from("crm_global_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const globalSettings: GlobalSettings = {
    timezone: String(gs?.timezone ?? "Europe/Vilnius"),
    language: String(gs?.language ?? "lt"),
  };

  const sectionShell = "mt-8 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm";
  const sectionTitle = "text-sm font-semibold text-zinc-900";
  const help = "mt-1 text-xs text-zinc-500";
  const label = "text-xs font-medium text-zinc-700";
  const input =
    "mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm shadow-black/5 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10";

  const buildInfo = getPublicBuildInfo();
  const versionLabel = buildInfo.appVersion ? `v${buildInfo.appVersion}` : "—";
  const releaseLabel = buildInfo.buildDateIso ?? "—";
  const commitLabel = buildInfo.commitHash ?? "—";
  const systemSummary = [
    `Versija: ${versionLabel}`,
    `Release: ${releaseLabel}`,
    `Commit: ${commitLabel}`,
  ].join("\n");

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <div className="mx-auto w-full max-w-[900px]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Bendri</h1>
          <p className="mt-1 text-sm text-zinc-600">Laiko juosta ir kalba (admin).</p>
        </div>

        <section className={sectionShell} aria-labelledby="global-tz-lang">
          <div className={sectionTitle} id="global-tz-lang">
            Time Zone ir kalba (global)
          </div>
          <p className={help}>Numatytoji CRM laiko juosta ir kalba (sistemos lygis).</p>

          <form action={updateGlobalSettingsAction} className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <div className={label}>Time Zone (global)</div>
              <select className={input} name="timezone" defaultValue={globalSettings.timezone}>
                <option value="Europe/Vilnius">Vilnius (Europe)</option>
                <option value="Europe/London">London (UK)</option>
                <option value="America/New_York">New York (US)</option>
              </select>
            </div>
            <div>
              <div className={label}>Kalba (global)</div>
              <select className={input} name="language" defaultValue={globalSettings.language}>
                <option value="lt">Lietuvių</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="pt-1">
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800">
                Išsaugoti
              </button>
            </div>
          </form>
        </section>

        <div className="mt-8 whitespace-pre-line text-xs leading-5 text-zinc-500">
          <div className="font-medium text-zinc-600">Sistema</div>
          {systemSummary}
        </div>
      </div>
    </CrmTableContainer>
  );
}

