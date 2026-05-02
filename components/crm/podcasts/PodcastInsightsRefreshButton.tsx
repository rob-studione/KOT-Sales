"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PodcastInsightsRefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function onRefresh() {
    setLoading(true);
    setHint(null);
    try {
      const res = await fetch("/api/crm/yt-podcasts/refresh-insights", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setHint(data.error ?? "Nepavyko atnaujinti.");
        return;
      }
      setHint("Įžvalgos atnaujintos.");
      router.refresh();
    } catch {
      setHint("Tinklo klaida.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`flex shrink-0 flex-col items-end gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
      >
        {loading ? "Atnaujinama…" : "Atnaujinti įžvalgas"}
      </button>
      {hint ? <p className="max-w-[220px] text-right text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
