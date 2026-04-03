"use client";

import { useEffect, useState } from "react";
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

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-xs font-medium text-zinc-500">Paskutinė sinchronizacija</div>
      {last ? (
        <div className="mt-2 space-y-1 text-sm">
          <div className="font-medium text-zinc-900">{new Date(last.at).toLocaleString("lt-LT")}</div>
          <div className="text-zinc-700">
            {last.validRows} unikalios
            {last.listRowsRaw != null && last.listRowsRaw > last.validRows
              ? ` (API ${last.listRowsRaw} eil.)`
              : ""}{" "}
            • {last.upsertedCount} įrašyta • {last.pagesFetched} pusl. • {stoppedReasonLt(last.stoppedReason)}
          </div>
          {last.error ? <div className="text-xs text-red-600">{last.error}</div> : null}
        </div>
      ) : (
        <div className="mt-2 text-sm text-zinc-600">Sinchronizacija dar nebuvo paleista.</div>
      )}
    </div>
  );
}
