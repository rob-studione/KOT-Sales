import Link from "next/link";

import {
  PODCAST_FEED_CATEGORY_TAB_ORDER,
  PODCAST_FEED_PERIOD_OPTIONS,
  buildPodcastFeedHref,
  type PodcastFeedCategorySlug,
  type PodcastFeedPeriodSlug,
} from "@/lib/ytPodcast/podcastFeedTabs";

function categoryTabClass(active: boolean): string {
  return active
    ? "rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white sm:px-2.5 sm:text-xs"
    : "rounded-full px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 sm:px-2.5 sm:text-xs";
}

function periodTabClass(active: boolean): string {
  return active
    ? "rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-900"
    : "rounded-full px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800";
}

export function PodcastaiFeedToolbar(props: {
  category: PodcastFeedCategorySlug;
  period: PodcastFeedPeriodSlug;
}) {
  const { category, period } = props;

  return (
    <div className="mt-6 border-b border-zinc-200/80 pb-4">
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-3">
        <nav
          className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 sm:gap-1"
          aria-label="Podcastų kategorijos"
        >
          {PODCAST_FEED_CATEGORY_TAB_ORDER.map(({ slug, label }) => (
            <Link
              key={slug}
              href={buildPodcastFeedHref({ category: slug, period })}
              scroll={false}
              className={`shrink-0 whitespace-nowrap ${categoryTabClass(category === slug)}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div
          className="flex shrink-0 flex-nowrap items-center gap-0.5 sm:gap-1"
          role="group"
          aria-label="Laikotarpio filtras"
        >
          {PODCAST_FEED_PERIOD_OPTIONS.map(({ slug, label }) => (
            <Link
              key={slug}
              href={buildPodcastFeedHref({ category, period: slug })}
              scroll={false}
              className={`shrink-0 whitespace-nowrap ${periodTabClass(period === slug)}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
