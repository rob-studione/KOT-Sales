"use client";

import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrmContentContainer } from "@/components/crm/CrmContentContainer";
import { ManagerObligationsDrawer } from "@/components/crm/manager-obligations/ManagerObligationsDrawer";
import { CRM_OBLIGATIONS_REFRESH_EVENT } from "@/lib/crm/crmObligationsRefresh";
import type {
  ManagerObligationCounts,
  ManagerObligationItem,
  ManagerObligationKind,
} from "@/lib/crm/managerObligations";

type ApiOk = {
  ok: true;
  today: string;
  counts: ManagerObligationCounts;
  items: ManagerObligationItem[];
};

const POLL_MS = 5 * 60_000;
const FOCUS_REFRESH_MIN_MS = 60_000;

function chipClass(tone: "neutral" | "warn" | "bad"): string {
  if (tone === "bad") return "border-red-200/80 bg-red-50 text-red-800 hover:bg-red-100/70";
  if (tone === "warn") return "border-amber-200/80 bg-amber-50 text-amber-900 hover:bg-amber-100/70";
  return "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100";
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
  const hasOverdue = items.some((i) => i.tone === "overdue");

  function openDrawer(kind: ManagerObligationKind | null) {
    setFilterKind(kind);
    setDrawerOpen(true);
  }

  return (
    <>
      <div
        className={`shrink-0 border-b bg-white ${hasOverdue ? "border-red-200/70" : "border-zinc-200"}`}
        role="status"
        aria-live="polite"
      >
        <CrmContentContainer className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                hasOverdue ? "bg-red-50 text-red-700" : "bg-[#7C4A57]/10 text-[#7C4A57]"
              }`}
            >
              <AlertCircle className="h-4 w-4" aria-hidden />
            </span>
            <button
              type="button"
              onClick={() => openDrawer(null)}
              className="cursor-pointer text-sm font-medium text-zinc-900 hover:text-[#7C4A57]"
            >
              {counts.total} neatlikta
            </button>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => openDrawer(c.key)}
                className={`cursor-pointer rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${chipClass(c.tone)}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openDrawer(null)}
            className="ml-auto shrink-0 text-xs font-medium text-[#7C4A57] underline-offset-2 hover:underline"
          >
            Visas sąrašas
          </button>
        </CrmContentContainer>
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
