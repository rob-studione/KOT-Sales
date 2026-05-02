import { PodcastInsightsRefreshButton } from "@/components/crm/podcasts/PodcastInsightsRefreshButton";
import { PodcastaiFeedToolbar } from "@/components/crm/podcasts/PodcastaiFeedToolbar";
import { PodcastInsightCardClient } from "@/components/crm/podcasts/PodcastInsightCardClient";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { buildPodcastInsightsFeed } from "@/lib/ytPodcast/buildPodcastInsightsFeed";
import { parsePodcastFeedSearchParams } from "@/lib/ytPodcast/podcastFeedTabs";

export const dynamic = "force-dynamic";

export default async function PodcastaiPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[]; period?: string | string[]; sort?: string | string[] }>;
}) {
  const sp = await searchParams;
  const { category, period } = parsePodcastFeedSearchParams(sp);
  const crmUser = await getCurrentCrmUser();
  const showRefresh = crmUser?.role === "admin";

  const { feed, loadError } = await buildPodcastInsightsFeed({ category, period });

  return (
    <CrmTableContainer className="py-10">
      <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6">
        <header className="border-b border-zinc-200/80 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Podcastai</h1>
            {showRefresh ? <PodcastInsightsRefreshButton /> : null}
          </div>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-600">
            Atrinktos verslo ir technologijų įžvalgos iš podcastų — be video sąrašo ir techninių būsenų.
          </p>
        </header>

        <PodcastaiFeedToolbar category={category} period={period} />

        <section className="mt-2 pb-16">
          {loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : feed.length === 0 ? (
            <p className="text-[15px] leading-relaxed text-zinc-600">Šioje kategorijoje dar nėra rekomenduojamų įžvalgų.</p>
          ) : (
            <div>
              {feed.map((insight) => (
                <PodcastInsightCardClient key={insight.id} insight={insight} />
              ))}
            </div>
          )}
        </section>
      </div>
    </CrmTableContainer>
  );
}
