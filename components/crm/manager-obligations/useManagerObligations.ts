"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CRM_OBLIGATIONS_REFRESH_EVENT } from "@/lib/crm/crmObligationsRefresh";
import type {
  ManagerObligationCounts,
  ManagerObligationItem,
} from "@/lib/crm/managerObligationsShared";

type ApiOk = {
  ok: true;
  today: string;
  counts: ManagerObligationCounts;
  items: ManagerObligationItem[];
};

const POLL_MS = 5 * 60_000;
const FOCUS_REFRESH_MIN_MS = 60_000;

const EMPTY_COUNTS: ManagerObligationCounts = {
  urgent: 0,
  callback: 0,
  email: 0,
  commercial: 0,
  total: 0,
};

export function useManagerObligations(userId: string) {
  const [items, setItems] = useState<ManagerObligationItem[]>([]);
  const [counts, setCounts] = useState<ManagerObligationCounts>(EMPTY_COUNTS);
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

  const hasOverdue = items.some((i) => i.tone === "overdue") || counts.callback > 0;

  return { items, counts, hasOverdue, reload: load };
}
