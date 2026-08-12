"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  TranslatorCandidateEvidence,
  TranslatorCandidateRow,
  TranslatorCandidateSourceRow,
} from "@/lib/translatorSearch/types";

type CandidateWithSources = TranslatorCandidateRow & { sources: TranslatorCandidateSourceRow[] };

export function CandidatesPanel({
  candidates,
  isAdmin,
  loadError,
}: {
  candidates: CandidateWithSources[];
  isAdmin: boolean;
  loadError: string | null;
}) {
  if (loadError) {
    return (
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Kandidatai</h2>
        <p className="mt-2 text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  if (!candidates.length) {
    return (
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Kandidatai</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
          Kol kas kandidatų nėra. Jie atsiras paleidus paiešką su seed URL.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900">Kandidatai</h2>
      <ul className="mt-4 space-y-4">
        {candidates.map((c) => (
          <li key={c.id} className="rounded-lg border border-zinc-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-900">{c.display_name || "—"}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {c.entity_type} · {c.review_status} · sworn: {c.sworn_status}
                </p>
              </div>
              {isAdmin ? <CandidateReviewControls candidateId={c.id} current={c.review_status} /> : null}
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-1 text-sm text-zinc-700 sm:grid-cols-2">
              <div>El. paštas: {c.email ?? "—"}</div>
              <div>Tel.: {c.phone ?? "—"}</div>
              <div>Vieta: {[c.city, c.country].filter(Boolean).join(", ") || "—"}</div>
              <div>
                Svetainė:{" "}
                {c.website_url ? (
                  <a className="underline" href={c.website_url} target="_blank" rel="noreferrer">
                    {c.website_url}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </dl>
            {c.match_summary ? <p className="mt-2 text-sm text-zinc-600">{c.match_summary}</p> : null}
            {c.sources.length ? (
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Šaltiniai</p>
                <ul className="mt-2 space-y-3 text-sm">
                  {c.sources.map((s) => (
                    <li key={s.id}>
                      <a className="font-medium text-zinc-800 underline" href={s.canonical_url} target="_blank" rel="noreferrer">
                        {s.title || s.canonical_url}
                      </a>
                      <EvidenceList evidence={s.evidence} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: TranslatorCandidateEvidence | Record<string, unknown> }) {
  const entries = Object.entries(evidence ?? {}).filter(([, v]) => {
    return v && typeof v === "object" && "quote" in (v as object) && String((v as { quote?: unknown }).quote ?? "").trim();
  }) as Array<[string, { field?: string; quote: string }]>;

  if (!entries.length) {
    return <p className="mt-1 text-xs text-zinc-500">Nėra patvirtintų evidence citatų.</p>;
  }

  return (
    <ul className="mt-1 space-y-1">
      {entries.map(([field, ev]) => (
        <li key={field} className="text-xs text-zinc-600">
          <span className="font-semibold text-zinc-800">{ev.field || field}:</span> „{ev.quote}“
        </li>
      ))}
    </ul>
  );
}

function CandidateReviewControls({
  candidateId,
  current,
}: {
  candidateId: string;
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function review(status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/crm/translator-search/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId, reviewStatus: status, reviewNote: note || null }),
        });
        let json: { ok?: boolean; error?: string } = {};
        const text = await res.text();
        try {
          json = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {};
        } catch {
          setError("Serveris grąžino netikėtą atsakymą.");
          return;
        }
        if (!res.ok || !json.ok) {
          setError(json.error || `Klaida (${res.status})`);
          return;
        }
        router.refresh();
      } catch {
        setError("Tinklo klaida — bandykite dar kartą.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <p className="text-xs text-zinc-500">Dabar: {current}</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Pastaba (optional)"
        className="w-48 rounded border border-zinc-300 px-2 py-1 text-xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => review("approved")}
          className="rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => review("rejected")}
          className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {pending ? <p className="text-xs text-zinc-500">Saugoma…</p> : null}
    </div>
  );
}
