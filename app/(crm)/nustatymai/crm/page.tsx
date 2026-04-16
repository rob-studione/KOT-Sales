import { requireAdmin } from "@/lib/crm/currentUser";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { updateGlobalSettingsAction, updateUserPreferencesAction, upsertStatusAction } from "@/lib/crm/crmSettingsActions";

export const dynamic = "force-dynamic";

type GlobalSettings = {
  daily_call_target: number;
  daily_answered_target: number;
  sales_direct_rule: string;
  sales_influenced_rule: string;
  timezone: string;
  language: string;
};

type StatusRow = {
  key: string;
  sort_order: number;
  is_answered: boolean;
  is_not_answered: boolean;
  is_success: boolean;
  is_failure: boolean;
  is_active: boolean;
};

export default async function CrmSettingsPage() {
  const actor = await requireAdmin({ mode: "redirect", redirectTo: "/analitika" });

  const supabase = await createSupabaseSsrReadOnlyClient();
  const [{ data: gs }, { data: statuses }, { data: auth }] = await Promise.all([
    supabase.from("crm_global_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("crm_statuses").select("key,sort_order,is_answered,is_not_answered,is_success,is_failure,is_active").order("sort_order", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  const globalSettings: GlobalSettings = {
    daily_call_target: Number(gs?.daily_call_target ?? 30),
    daily_answered_target: Number(gs?.daily_answered_target ?? 10),
    sales_direct_rule: String(gs?.sales_direct_rule ?? ""),
    sales_influenced_rule: String(gs?.sales_influenced_rule ?? ""),
    timezone: String(gs?.timezone ?? "Europe/Vilnius"),
    language: String(gs?.language ?? "lt"),
  };

  const userId = auth.user?.id ?? null;
  const { data: userRow } = userId
    ? await supabase.from("crm_users").select("timezone,language").eq("id", userId).maybeSingle()
    : { data: null as { timezone?: string; language?: string } | null };

  const userTimezone = String(userRow?.timezone ?? "Europe/Vilnius");
  const userLanguage = String(userRow?.language ?? "lt");

  const rows: StatusRow[] =
    (statuses ?? []).map((r) => ({
      key: String((r as any).key ?? ""),
      sort_order: Number((r as any).sort_order ?? 0),
      is_answered: Boolean((r as any).is_answered),
      is_not_answered: Boolean((r as any).is_not_answered),
      is_success: Boolean((r as any).is_success),
      is_failure: Boolean((r as any).is_failure),
      is_active: Boolean((r as any).is_active ?? true),
    })) ?? [];

  const sectionShell = "mt-8 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm";
  const sectionTitle = "text-sm font-semibold text-zinc-900";
  const help = "mt-1 text-xs text-zinc-500";
  const label = "text-xs font-medium text-zinc-700";
  const input =
    "mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm shadow-black/5 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10";

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Bendri nustatymai</h1>
        <p className="mt-1 text-sm text-zinc-600">Pagrindinės CRM logikos konfigūracija (admin).</p>
      </div>

      <section className={sectionShell} aria-labelledby="calls-settings">
        <div className={sectionTitle} id="calls-settings">
          Skambučių nustatymai
        </div>
        <p className={help}>Apibrėžia, kurie statusai laikomi „atsiliepė“, „neatsiliepė“ ir „sėkminga baigtis“ analitikoje.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Statusas</th>
                <th className="px-3 py-2 text-center">Eilė</th>
                <th className="px-3 py-2 text-center">Atsiliepė</th>
                <th className="px-3 py-2 text-center">Neatsiliepė</th>
                <th className="px-3 py-2 text-center">Sėkminga</th>
                <th className="px-3 py-2 text-center">Nesėkminga</th>
                <th className="px-3 py-2 text-center">Aktyvus</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-2 font-medium text-zinc-900">{r.key}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-zinc-700">{r.sort_order}</td>
                  <td className="px-3 py-2 text-center">{r.is_answered ? "✓" : ""}</td>
                  <td className="px-3 py-2 text-center">{r.is_not_answered ? "✓" : ""}</td>
                  <td className="px-3 py-2 text-center">{r.is_success ? "✓" : ""}</td>
                  <td className="px-3 py-2 text-center">{r.is_failure ? "✓" : ""}</td>
                  <td className="px-3 py-2 text-center">{r.is_active ? "✓" : ""}</td>
                  <td className="px-3 py-2">
                    <form action={upsertStatusAction} className="flex flex-wrap items-center justify-end gap-2">
                      <input type="hidden" name="key" value={r.key} />
                      <input type="hidden" name="sort_order" value={String(r.sort_order)} />
                      <input type="hidden" name="is_answered" value={r.is_answered ? "1" : ""} />
                      <input type="hidden" name="is_not_answered" value={r.is_not_answered ? "1" : ""} />
                      <input type="hidden" name="is_success" value={r.is_success ? "1" : ""} />
                      <input type="hidden" name="is_failure" value={r.is_failure ? "1" : ""} />
                      <input type="hidden" name="is_active" value={r.is_active ? "1" : ""} />
                      <button type="submit" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
                        Išsaugoti (šiuo metu read-only)
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Šioje versijoje statusų redagavimas dar nėra pilnai suformuotas UI (checkbox’ai / reorder). Schema ir API veikia; UI padarysiu
          sekančiame žingsnyje.
        </div>
      </section>

      <section className={sectionShell} aria-labelledby="kpi-settings">
        <div className={sectionTitle} id="kpi-settings">
          KPI nustatymai
        </div>
        <p className={help}>Globalūs KPI tikslai (kol kas bendri visiems).</p>

        <form action={updateGlobalSettingsAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className={label}>daily_call_target</div>
            <input className={input} type="number" min={0} name="daily_call_target" defaultValue={globalSettings.daily_call_target} />
          </div>
          <div>
            <div className={label}>daily_answered_target</div>
            <input className={input} type="number" min={0} name="daily_answered_target" defaultValue={globalSettings.daily_answered_target} />
          </div>

          <div className="sm:col-span-2">
            <div className={label}>Pardavimų logika (direct)</div>
            <input className={input} name="sales_direct_rule" defaultValue={globalSettings.sales_direct_rule} />
          </div>
          <div className="sm:col-span-2">
            <div className={label}>Pardavimų logika (influenced)</div>
            <input className={input} name="sales_influenced_rule" defaultValue={globalSettings.sales_influenced_rule} />
          </div>

          <div>
            <div className={label}>Time Zone (global)</div>
            <select className={input} name="timezone" defaultValue={globalSettings.timezone}>
              {["Europe/Vilnius","Europe/London","Europe/Warsaw","Europe/Berlin","Europe/Paris","Europe/Riga","Europe/Tallinn","UTC"].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={label}>Kalba (global)</div>
            <select className={input} name="language" defaultValue={globalSettings.language}>
              <option value="lt">Lietuvių</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="sm:col-span-2 flex items-center justify-end">
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800">
              Išsaugoti
            </button>
          </div>
        </form>
      </section>

      <section className={sectionShell} aria-labelledby="user-prefs">
        <div className={sectionTitle} id="user-prefs">
          Time Zone ir Kalba (naudotojas)
        </div>
        <p className={help}>Paprasta per-naudotojo konfigūracija (jei norėsite account-level tik vienos reikšmės, galėsim pašalinti).</p>

        <form action={updateUserPreferencesAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className={label}>Time Zone</div>
            <select className={input} name="timezone" defaultValue={userTimezone}>
              {["Europe/Vilnius","Europe/London","Europe/Warsaw","Europe/Berlin","Europe/Paris","Europe/Riga","Europe/Tallinn","UTC"].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={label}>Kalba</div>
            <select className={input} name="language" defaultValue={userLanguage}>
              <option value="lt">Lietuvių</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex items-center justify-end">
            <button type="submit" className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50">
              Išsaugoti
            </button>
          </div>
        </form>
      </section>

      <div className="mt-6 text-xs text-zinc-500">
        Prisijungęs kaip: <span className="font-medium text-zinc-700">{actor.email ?? "—"}</span>
      </div>
    </CrmTableContainer>
  );
}

