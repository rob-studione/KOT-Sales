"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CRM_OBLIGATIONS_REFRESH_EVENT } from "@/lib/crm/crmObligationsRefresh";
import { formatDate } from "@/lib/crm/format";
import type {
  ManagerObligationCounts,
  ManagerObligationItem,
  ManagerObligationKind,
} from "@/lib/crm/managerObligations";
import { ManagerObligationsDrawer } from "@/components/crm/manager-obligations/ManagerObligationsDrawer";

type ApiOk = {
  ok: true;
  today: string;
  counts: ManagerObligationCounts;
  items: ManagerObligationItem[];
};

const POLL_MS = 5 * 60_000;
const FOCUS_REFRESH_MIN_MS = 60_000;

function chipClass(tone: "neutral" | "warn" | "bad"): string {
  if (tone === "bad") return "border-red-200 bg-red-50 text-red-900 hover:bg-red-100/80";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100/80";
  return "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50";
}

function summarizeCounts(
  counts: ManagerObligationCounts,
  items: ManagerObligationItem[]
): Array<{ key: ManagerObligationKind; label: string; tone: "neutral" | "warn" | "bad" }> {
  const chips: Array<{ key: ManagerObligationKind; label: string; tone: "neutral" | "warn" | "bad" }> = [];
  if (counts.callback > 0) {
    chips.push({ key: "callback", label: `${counts.callback} neperskamb.`, tone: "bad" });
  }
  if (counts.urgent > 0) {
    chips.push({
      key: "urgent",
      label: `${counts.urgent} skub${counts.urgent === 1 ? "us" : "ūs"}`,
      tone: items.some((i) => i.kind === "urgent" && i.tone === "overdue") ? "bad" : "warn",
    });
  }
  if (counts.email > 0) {
    const overdue = items.some((i) => i.kind === "email" && i.tone === "overdue");
    chips.push({
      key: "email",
      label: overdue ? `${counts.email} laiškas vėluoja` : `${counts.email} laiškas iki 18:00`,
      tone: overdue ? "bad" : "warn",
    });
  }
  if (counts.commercial > 0) {
    const overdue = items.some((i) => i.kind === "commercial" && i.tone === "overdue");
    chips.push({
      key: "commercial",
      label: overdue ? `${counts.commercial} komerc. vėluoja` : `${counts.commercial} komerc. iki 18:00`,
      tone: overdue ? "bad" : "warn",
    });
  }
  return chips;
}

export function ManagerObligationsBar({ userId }: { userId: string }) {
  const [items, setItems] = useState<ManagerObligationItem[]>([]);
  const [counts, setCounts] = useState<ManagerObligationCounts>({
    urgent: 0,
    callback: 0,
    email: 0,
    commercial: 0,
    total: 0,
  });
  const [today, setToday] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterKind, setFilterKind] = useState<ManagerObligationKind | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchRef = useRef(0);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/crm/obligations", { cache: "no-store" });
      const json = (await res.json()) as ApiOk | { ok: false };
      if (!res.ok || !json.ok) return;
      setItems(json.items);
      setCounts(json.counts);
      setToday(json.today);
      lastFetchRef.current = Date.now();
    } catch {
      /* ignore */
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
  }, [load, userId]);

  useEffect(() => {
    function onRefresh() {
      void load();
    }
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (lastFetchRef.current === 0) return;
      if (Date.now() - lastFetchRef.current < FOCUS_REFRESH_MIN_MS) return;
      void load();
    }
    window.addEventListener(CRM_OBLIGATIONS_REFRESH_EVENT, onRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(CRM_OBLIGATIONS_REFRESH_EVENT, onRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  if (counts.total === 0) return null;

  const chips = summarizeCounts(counts, items);

  function openDrawer(kind: ManagerObligationKind | null) {
    setFilterKind(kind);
    setDrawerOpen(true);
  }

  return (
    <>
      <div
        className="border-b border-amber-200/80 bg-amber-50/90 px-4 py-2 sm:px-6"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">Neatlikta</span>
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => openDrawer(c.key)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${chipClass(c.tone)}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openDrawer(null)}
            className="ml-auto text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
          >
            Visas sąrašas ({counts.total})
          </button>
        </div>
        {today ? (
          <p className="mt-1 text-[11px] text-amber-900/70">
            Patvirtinkite Kanban lentoje tą pačią dieną (laiškai/komerciniai iki 18:00). Šiandien: {formatDate(today)}.
          </p>
        ) : null}
      </div>

      <ManagerObligationsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
        filterKind={filterKind}
      />
    </>
  );
}
