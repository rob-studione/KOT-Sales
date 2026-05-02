import { requireAdmin } from "@/lib/crm/currentUser";
import { YtPodcastAiSettingsPanel } from "@/components/crm/YtPodcastAiSettingsPanel";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { getYtPodcastCurrentMonthAiCostEur } from "@/lib/ytPodcast/aiUsage";
import { fetchYtPodcastAiSettings } from "@/lib/ytPodcast/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function YtPodcastAiSettingsPage() {
  await requireAdmin({ mode: "redirect", redirectTo: "/dashboard" });

  const admin = createSupabaseAdminClient();
  const [settings, monthCost] = await Promise.all([fetchYtPodcastAiSettings(admin), getYtPodcastCurrentMonthAiCostEur(admin)]);

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <div className="mx-auto w-full max-w-[900px]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Podcastai (AI)</h1>
          <p className="mt-1 text-sm text-zinc-600">
            YouTube podcastų AI ribos ir mėnesio sąnaudų apskaita. Kol „Įjungta“ išjungta, automatinė analizė nevykdoma.
          </p>
        </div>

        <div className="mt-8">
          <YtPodcastAiSettingsPanel initial={settings} monthYtPodcastCostEur={monthCost} />
        </div>
      </div>
    </CrmTableContainer>
  );
}
