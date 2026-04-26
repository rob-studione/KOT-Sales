"use client";

import { useEffect, useRef } from "react";

export type RoutePerfMarkerServerPerf = {
  totalServerMs?: number;
  projectMs?: number;
  crmUsersMs?: number;
  candidatesRpcMs?: number;
  workItemsMs?: number;
  activitiesMs?: number;
  revenueFeedMs?: number;
  liveRevenueLookupMs?: number;
  kanbanClientLiveLookupMs?: number;
  procurementMs?: number;
  roundTripCount?: number;
  tab?: string;
};

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function RoutePerfMarker({
  routeLabel,
  serverPerf,
}: {
  routeLabel: string;
  serverPerf?: RoutePerfMarkerServerPerf;
}) {
  const mountT0 = useRef<number | null>(null);
  if (mountT0.current == null && typeof performance !== "undefined") {
    mountT0.current = performance.now();
  }

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CRM_PERF_LOG !== "1") return;
    const tMount = mountT0.current ?? performance.now();

    const click = safeJsonParse<{ href?: string; clickAtMs?: number; clickAtEpochMs?: number }>(
      sessionStorage.getItem("crm_nav_click")
    );
    const clickToMountMs =
      click?.clickAtMs != null && Number.isFinite(click.clickAtMs) ? Math.round(tMount - click.clickAtMs) : null;

    // Best-effort: find latest RSC fetch resource timing for this route.
    // In App Router, navigation usually triggers a fetch with `?__rsc=...`.
    let rsc: {
      name: string;
      startTime: number;
      responseStart: number;
      duration: number;
    } | null = null;
    try {
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      for (let i = resources.length - 1; i >= 0; i--) {
        const e = resources[i]!;
        if (!e.name.includes("__rsc")) continue;
        if (!e.name.includes("/projektai/")) continue;
        rsc = { name: e.name, startTime: e.startTime, responseStart: e.responseStart, duration: e.duration };
        break;
      }
    } catch {
      // ignore
    }

    // Approx paint after hydration-ish: 2 rafs after mount.
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        console.info(`[CRM perf] ${routeLabel} client markers`, {
          clickToMountMs,
          mountToRaf2Ms: Math.round(performance.now() - tMount),
          rscFetchTtfbMs:
            rsc && Number.isFinite(rsc.responseStart) ? Math.round(rsc.responseStart - rsc.startTime) : null,
          rscFetchTotalMs: rsc && Number.isFinite(rsc.duration) ? Math.round(rsc.duration) : null,
          rscUrl: rsc?.name,
          serverPerf,
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [routeLabel, serverPerf]);

  return null;
}

