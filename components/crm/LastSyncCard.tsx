"use client";

import { useEffect, useState } from "react";
import { formatDateTimeLt } from "@/lib/crm/format";
import { stoppedReasonLt } from "@/lib/crm/stoppedReasonLt";

type LastSync = {
  fetchedTotal: number;
  validRows: number;
  listRowsRaw?: number;
  duplicateRowsMerged?: number;
  upsertedCount: number;
  pagesFetched: number;
  stoppedReason: string;
  error?: string | null;
  at: string;
};

const STORAGE_KEY = "salex:lastSync";

export function saveLastSync(value: Omit<LastSync, "at">) {
  try {
    const payload: LastSync = { ...value, at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event("salex:lastSync"));
  } catch {
    // ignore
  }
}

export default function LastSyncCard() {
  const [last, setLast] = useState<LastSync | null>(null);
  const [serverAt, setServerAt] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return setLast(null);
        const parsed = JSON.parse(raw) as LastSync;
        if (!parsed || typeof parsed !== "object") return setLast(null);
        setLast(parsed);
      } catch {
        setLast(null);
      }
    };

    read();
    window.addEventListener("salex:lastSync", read);
    return () => window.removeEventListener("salex:lastSync", read);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sync-saskaita123/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { lastRunAt?: unknown };
        const at = typeof json?.lastRunAt === "string" ? json.lastRunAt : null;
        if (!cancelled) setServerAt(at);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shownAt = serverAt ?? last?.at ?? null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-xs font-medium text-zinc-500">Paskutinė sinchronizacija</div>
      {shownAt ? (
        <div className="mt-2 space-y-1 text-sm">
          <div className="font-medium text-zinc-900">{formatDateTimeLt(shownAt)}</div>
          <div className="text-zinc-700">
            {last?.validRows ?? 0} unikalios
            {last?.listRowsRaw != null && last.listRowsRaw > (last?.validRows ?? 0)
              ? ` (API ${last.listRowsRaw} eil.)`
              : ""}{" "}
            • {last?.upsertedCount ?? 0} įrašyta • {last?.pagesFetched ?? 0} pusl. •{" "}
            {stoppedReasonLt(last?.stoppedReason ?? "unknown")}
          </div>
          {last?.error ? <div className="text-xs text-red-600">{last.error}</div> : null}
        </div>
      ) : (
        <div className="mt-2 text-sm text-zinc-600">Sinchronizacija dar nebuvo paleista.</div>
      )}
    </div>
  );
}
