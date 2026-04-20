import { requireAdmin } from "@/lib/crm/currentUser";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { getLostQaSettings } from "@/lib/crm/lostQa/lostQaControlSettings";
import { getLostQaAiUsageStats } from "@/lib/crm/lostQa/aiUsageStats";
import { LostQaSettingsPanel } from "@/components/crm/LostQaSettingsPanel";

export const dynamic = "force-dynamic";

export default async function LostQaSettingsPage() {
  await requireAdmin({ mode: "redirect", redirectTo: "/dashboard" });

  const admin = createSupabaseAdminClient();
  const [settings, stats] = await Promise.all([getLostQaSettings(admin), getLostQaAiUsageStats(admin)]);

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Lost QA</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Čia gali saugiai įjungti ar išjungti AI analizę ir matyti apytikslį jos kaštą. Pakeitimai skirti vidiniam CRM naudojimui.
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          Šie nustatymai taikomi naujiems atvejams. Jau išanalizuoti atvejai nebus keičiami.
        </p>
      </div>

      <div className="mt-8">
        <LostQaSettingsPanel initial={settings} stats={stats} />
      </div>
    </CrmTableContainer>
  );
}
