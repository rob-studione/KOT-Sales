"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveLastSync } from "@/components/crm/LastSyncCard";
import { stoppedReasonLt } from "@/lib/crm/stoppedReasonLt";

type SyncResult = {
  fullSync: boolean;
  maxPages: number;
  fetchedTotal: number;
  validRows: number;
  listRowsRaw?: number;
  duplicateRowsMerged?: number;
  upsertedCount: number;
  pagesFetched: number;
  stoppedReason: string;
  error?: string | null;
};

export default function SyncInvoicesButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [fullSync, setFullSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function onClick() {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sync-saskaita123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full: fullSync }),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Netinkamas atsakas (HTTP ${res.status})`);
      }

      if (!res.ok) {
        const message =
          json && typeof json === "object" && json !== null && "error" in json
            ? String((json as { error?: unknown }).error)
            : `HTTP ${res.status}`;
        throw new Error(message);
      }

      const obj = json as Partial<SyncResult>;
      setResult({
        fullSync: Boolean(obj.fullSync),
        maxPages: Number(obj.maxPages ?? 0),
        fetchedTotal: Number(obj.fetchedTotal ?? 0),
        validRows: Number(obj.validRows ?? 0),
        listRowsRaw: obj.listRowsRaw != null ? Number(obj.listRowsRaw) : undefined,
        duplicateRowsMerged: obj.duplicateRowsMerged != null ? Number(obj.duplicateRowsMerged) : undefined,
        upsertedCount: Number(obj.upsertedCount ?? 0),
        pagesFetched: Number(obj.pagesFetched ?? 0),
        stoppedReason: String(obj.stoppedReason ?? ""),
        error: obj.error != null ? String(obj.error) : null,
      });

      saveLastSync({
        fetchedTotal: Number(obj.fetchedTotal ?? 0),
        validRows: Number(obj.validRows ?? 0),
        listRowsRaw: obj.listRowsRaw != null ? Number(obj.listRowsRaw) : undefined,
        duplicateRowsMerged: obj.duplicateRowsMerged != null ? Number(obj.duplicateRowsMerged) : undefined,
        upsertedCount: Number(obj.upsertedCount ?? 0),
        pagesFetched: Number(obj.pagesFetched ?? 0),
        stoppedReason: String(obj.stoppedReason ?? ""),
        error: obj.error != null ? String(obj.error) : null,
      });

      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sinchronizacija nepavyko");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Sinchronizacija</h2>
          <p className="text-sm text-zinc-600">Atsisiunčia sąskaitas iš Saskaita123 ir įrašo į Supabase.</p>
          <label className="mt-2 flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={fullSync}
              onChange={(e) => setFullSync(e.target.checked)}
              disabled={syncing}
              className="rounded border-zinc-300"
            />
            Pilna sinchronizacija (daug puslapių; naudoti po DB išvalymo)
          </label>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={syncing}
          className="h-10 cursor-pointer rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? "Sinchronizuojama…" : fullSync ? "Pilna sinchronizacija" : "Sinchronizuoti"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {result ? (
        <div className="mt-3 space-y-1 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          <div>
            Unikalios sąskaitos: <span className="font-medium">{result.validRows}</span>
            {result.listRowsRaw != null && result.listRowsRaw > result.validRows ? (
              <>
                {" "}
                (API eilučių: <span className="font-medium">{result.listRowsRaw}</span>
                {result.duplicateRowsMerged != null && result.duplicateRowsMerged > 0
                  ? `, sutraukta dublikatų: ${result.duplicateRowsMerged}`
                  : ""}
                )
              </>
            ) : null}{" "}
            • Įrašyta naujų: <span className="font-medium">{result.upsertedCount}</span> • Puslapių:{" "}
            <span className="font-medium">{result.pagesFetched}</span>
            {result.fullSync ? (
              <>
                {" "}
                (iki <span className="font-medium">{result.maxPages}</span> pusl.)
              </>
            ) : null}
          </div>
          <div className="text-zinc-600">{stoppedReasonLt(result.stoppedReason)}</div>
          {result.error ? <div className="text-xs text-red-600">{result.error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
