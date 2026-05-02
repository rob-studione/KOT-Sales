"use client";

import { useState } from "react";

import type { PodcastFeedInsight } from "@/lib/ytPodcast/podcastFeedInsightTypes";
import {
  decodeHtmlEntities,
  estimateInsightReadingMinutes,
  formatInsightDateLt,
  normalizeActionForDisplay,
} from "@/lib/ytPodcast/podcastFeedInsightTypes";

function CategoryBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200/90 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
      {label}
    </span>
  );
}

export function PodcastInsightCardClient({ insight }: { insight: PodcastFeedInsight }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `${insight.id}-expand`;

  const headline = decodeHtmlEntities(insight.headline);
  const coreIdea = decodeHtmlEntities(insight.coreIdea);
  const whyItMatters = decodeHtmlEntities(insight.whyItMatters);
  const action = normalizeActionForDisplay(decodeHtmlEntities(insight.action));
  const keyFacts = insight.keyFacts.map((s) => decodeHtmlEntities(s));
  const mins = estimateInsightReadingMinutes(insight);

  const hasExpandable = Boolean(whyItMatters) || keyFacts.length > 0;

  return (
    <article className="border-b border-zinc-100 py-8 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CategoryBadge label={insight.category} />
        <span className="text-[11px] text-zinc-500">
          {insight.channelTitle} · {formatInsightDateLt(insight.publishedAt)} · ~{mins} min
        </span>
      </div>

      <h2 className="mt-2.5 text-xl font-semibold leading-snug tracking-tight text-zinc-900">{headline}</h2>

      {coreIdea ? (
        <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-zinc-700">{coreIdea}</p>
      ) : null}

      {insight.action ? (
        <div className="mt-4 rounded-xl border border-zinc-200/70 bg-zinc-50/90 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Veiksmas</p>
          <p className="mt-1.5 text-[15px] leading-snug text-zinc-900">{action}</p>
        </div>
      ) : null}

      {hasExpandable ? (
        <>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition hover:text-zinc-900 hover:decoration-zinc-500"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Suskleisti" : "Plačiau"}
          </button>

          {expanded ? (
            <div id={panelId} className="mt-4 space-y-5 border-t border-zinc-100/90 pt-4">
              {whyItMatters ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Kodėl svarbu</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-700">{whyItMatters}</p>
                </div>
              ) : null}
              {keyFacts.length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Konkretūs faktai
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-zinc-700">
                    {keyFacts.map((fact, i) => (
                      <li key={`${insight.id}-fact-${i}`} className="flex gap-2 pl-0.5">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-300" aria-hidden />
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {insight.videoUrl ? (
        <p className="mt-4 text-sm">
          <a
            href={insight.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-zinc-800 underline-offset-4 transition hover:text-zinc-950 hover:underline"
          >
            Žiūrėti video →
          </a>
        </p>
      ) : null}
    </article>
  );
}
