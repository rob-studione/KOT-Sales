"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateYtPodcastAiSettingsAction } from "@/lib/crm/ytPodcastSettingsActions";
import type { YtPodcastAiSettings } from "@/lib/ytPodcast/settings";

function eur(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function YtPodcastAiSettingsPanel(props: { initial: YtPodcastAiSettings; monthYtPodcastCostEur: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const limitBanner = useMemo(() => {
    if (!props.initial.stopOnLimit) return false;
    return props.monthYtPodcastCostEur >= props.initial.costLimitEur;
  }, [props.initial.costLimitEur, props.initial.stopOnLimit, props.monthYtPodcastCostEur]);

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Podcastai (AI)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Ribos ir išjungiklis YouTube podcastų AI analizei. Kol „Įjungta“ išjungta, 4 etapas neturi vykdyti analizės.
          </p>
        </div>
        {isPending ? <div className="text-xs text-zinc-500">Saugoma…</div> : null}
      </div>

      {limitBanner ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Pasiektas podcastų AI mėnesio limitas ({eur(props.monthYtPodcastCostEur)} / {eur(props.initial.costLimitEur)}).
        </div>
      ) : null}

      {!props.initial.enabled ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
          Podcastų AI išjungta — automatinė analizė nebus leidžiama.
        </div>
      ) : null}

      {saved ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Pakeitimai išsaugoti.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Nepavyko išsaugoti: {error}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2">
          <div className="text-xs font-medium text-zinc-600">Podcast AI (šį mėnesį)</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{eur(props.monthYtPodcastCostEur)}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Tik įrašai su meta.feature prasidedančiu „yt_podcast_“.</div>
        </div>
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const r = await updateYtPodcastAiSettingsAction(fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setSaved(true);
            router.refresh();
          });
        }}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="enabled"
            className="mt-1 h-4 w-4"
            defaultChecked={props.initial.enabled}
            disabled={isPending}
          />
          <span>
            <div className="text-sm font-medium text-zinc-900">Įjungta</div>
            <div className="mt-1 text-xs text-zinc-600">Kai išjungta, AI analizė nevykdoma (4 etapas turi tikrinti šį lauką).</div>
          </span>
        </label>

        <div>
          <label className="text-xs font-medium text-zinc-700" htmlFor="yt-cost-limit">
            Mėnesio limitas (€)
          </label>
          <input
            id="yt-cost-limit"
            name="cost_limit_eur"
            type="number"
            min={1}
            max={500}
            step={1}
            defaultValue={props.initial.costLimitEur}
            disabled={isPending}
            className="mt-1 h-9 w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="stop_on_limit"
            className="mt-1 h-4 w-4"
            defaultChecked={props.initial.stopOnLimit}
            disabled={isPending}
          />
          <span>
            <div className="text-sm font-medium text-zinc-900">Stabdyti pasiekus limitą</div>
            <div className="mt-1 text-xs text-zinc-600">Jei įjungta ir sąnaudos viršija limitą, AI apdorojimas sustabdomas.</div>
          </span>
        </label>

        <div>
          <label className="text-xs font-medium text-zinc-700" htmlFor="yt-max-videos">
            Max videos per run
          </label>
          <input
            id="yt-max-videos"
            name="max_videos_per_run"
            type="number"
            min={1}
            max={10}
            step={1}
            defaultValue={props.initial.maxVideosPerRun}
            disabled={isPending}
            className="mt-1 h-9 w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-700" htmlFor="yt-max-chars">
            Max transcript chars
          </label>
          <input
            id="yt-max-chars"
            name="max_transcript_chars"
            type="number"
            min={10000}
            max={250000}
            step={1000}
            defaultValue={props.initial.maxTranscriptChars}
            disabled={isPending}
            className="mt-1 h-9 w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-700" htmlFor="yt-prompt-version">
            Analysis prompt version
          </label>
          <input
            id="yt-prompt-version"
            name="analysis_prompt_version"
            type="text"
            maxLength={64}
            defaultValue={props.initial.analysisPromptVersion}
            disabled={isPending}
            className="mt-1 h-9 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <div className="pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
          >
            Išsaugoti
          </button>
        </div>
      </form>
    </section>
  );
}
