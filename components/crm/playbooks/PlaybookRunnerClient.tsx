"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

export type PlaybookRunnerNode = {
  id: string;
  title: string;
  body: string;
  type: string;
};

export type PlaybookRunnerEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  label: string;
};

type RunnerHistoryItem = {
  nodeId: string;
  selectedEdgeLabel?: string;
};

type OutcomeKey = "send_email" | "follow_up" | "not_relevant" | "trial_offer";

function outcomeKeyFromTitle(title: string): OutcomeKey | null {
  const raw = (title ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^Outcome:\s*(.+)$/i);
  if (!m) return null;
  const key = m[1]?.trim().toLowerCase();
  if (!key) return null;
  if (key === "send_email") return "send_email";
  if (key === "follow_up") return "follow_up";
  if (key === "not_relevant") return "not_relevant";
  if (key === "trial_offer") return "trial_offer";
  return null;
}

function outcomeHintForKey(key: OutcomeKey): string {
  switch (key) {
    case "send_email":
      return "Išsiųsti komercinį pasiūlymą";
    case "follow_up":
      return "Sukurti follow-up (data)";
    case "not_relevant":
      return "Pažymėti kaip neaktualų";
    case "trial_offer":
      return "Pasiūlyti bandomąjį vertimą";
  }
}

const RUNNER_STEPKeyframesId = "playbook-runner-step-keyframes";

function ensureRunnerStepKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(RUNNER_STEPKeyframesId)) return;
  const el = document.createElement("style");
  el.id = RUNNER_STEPKeyframesId;
  el.textContent = `
@keyframes playbookRunnerStepIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .playbook-runner-step-enter { animation: none !important; }
}
.playbook-runner-step-enter { animation: playbookRunnerStepIn 0.18s ease-out both; }
`;
  document.head.appendChild(el);
}

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}

export function PlaybookRunnerClient({
  playbookName,
  initialNodeId,
  nodes,
  edges,
}: {
  playbookName: string;
  initialNodeId: string;
  nodes: PlaybookRunnerNode[];
  edges: PlaybookRunnerEdge[];
}) {
  // History is empty when we're on the start node (implicit).
  const [history, setHistory] = useState<RunnerHistoryItem[]>([]);
  const [lastAppendedNodeId, setLastAppendedNodeId] = useState<string | null>(null);

  const prefersReducedMotion = usePrefersReducedMotion();
  const initialScrollSkipRef = useRef(true);
  const prevLenRef = useRef<number>(0);
  const clearPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeStepRef = useRef<HTMLDivElement | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const choicesByFromNodeId = useMemo(() => {
    const map = new Map<string, PlaybookRunnerEdge[]>();
    for (const edge of edges) {
      const list = map.get(edge.from_node_id) ?? [];
      list.push(edge);
      map.set(edge.from_node_id, list);
    }
    return map;
  }, [edges]);

  const steps: RunnerHistoryItem[] =
    history.length === 0 ? [{ nodeId: initialNodeId }] : history;

  const currentNodeId = steps[steps.length - 1]?.nodeId ?? initialNodeId;
  const choices = choicesByFromNodeId.get(currentNodeId) ?? [];

  const progressLabel = `Žingsnis ${steps.length} iš ${steps.length}`;

  useLayoutEffect(() => {
    ensureRunnerStepKeyframes();
  }, []);

  useEffect(() => {
    const len = steps.length;
    if (initialScrollSkipRef.current) {
      initialScrollSkipRef.current = false;
      prevLenRef.current = len;
      return;
    }

    const appended = len > prevLenRef.current;
    prevLenRef.current = len;

    if (clearPulseTimerRef.current) {
      clearTimeout(clearPulseTimerRef.current);
      clearPulseTimerRef.current = null;
    }

    if (!appended) {
      setLastAppendedNodeId(null);
    } else if (!prefersReducedMotion) {
      setLastAppendedNodeId(currentNodeId);
      clearPulseTimerRef.current = setTimeout(() => {
        setLastAppendedNodeId(null);
        clearPulseTimerRef.current = null;
      }, 220);
    }

    const el = activeStepRef.current;
    if (el) {
      const behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";
      el.scrollIntoView({ behavior, block: "start" });
    }

    return () => {
      if (clearPulseTimerRef.current) {
        clearTimeout(clearPulseTimerRef.current);
        clearPulseTimerRef.current = null;
      }
    };
  }, [currentNodeId, steps.length, prefersReducedMotion]);

  function onSelectChoice(edge: PlaybookRunnerEdge) {
    setHistory((prev) => {
      const base = prev.length === 0 ? [{ nodeId: initialNodeId }] : prev;
      const next = [...base];
      const lastIdx = next.length - 1;
      next[lastIdx] = { ...next[lastIdx], selectedEdgeLabel: edge.label };
      next.push({ nodeId: edge.to_node_id });
      return next;
    });
  }

  function onBackOneStep() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      if (next.length === 0) return next;
      const lastIdx = next.length - 1;
      next[lastIdx] = { ...next[lastIdx], selectedEdgeLabel: undefined };
      return next;
    });
  }

  function onReset() {
    setHistory([]);
  }

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-8">
      <div className="mb-4 space-y-2">
        <div className="text-sm text-zinc-500">
          <Link href="/scenarijai" className="font-medium text-zinc-600 hover:text-zinc-900">
            ← Scenarijai
          </Link>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{playbookName}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onBackOneStep}
              disabled={history.length === 0}
            >
              Atgal
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-[#7C4A57] px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-[#7C4A57]/20 hover:bg-[#693948]"
              onClick={onReset}
            >
              Pradėti iš naujo
            </button>
          </div>
        </div>
      </div>

      <p className="mb-4 text-center text-xs font-medium tracking-wide text-zinc-500">{progressLabel}</p>

      <div className="space-y-8">
        {steps.map((item, idx) => {
          const node = nodeById.get(item.nodeId) ?? null;
          const isActive = idx === steps.length - 1;
          const options = choicesByFromNodeId.get(item.nodeId) ?? [];
          const selected = item.selectedEdgeLabel;
          const showStepEnter =
            isActive &&
            !prefersReducedMotion &&
            lastAppendedNodeId !== null &&
            lastAppendedNodeId === currentNodeId &&
            lastAppendedNodeId === item.nodeId;

          return (
            <div
              key={`${item.nodeId}-${idx}`}
              ref={isActive ? activeStepRef : undefined}
              className={["space-y-4", isActive ? "scroll-mt-24" : "", showStepEnter ? "playbook-runner-step-enter" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <div
                className={[
                  "rounded-xl px-5 py-5 transition-[opacity,box-shadow,background-color,border-color] duration-200",
                  isActive
                    ? "border border-[#7C4A57]/20 bg-zinc-100/80 shadow-md ring-1 ring-[#7C4A57]/10"
                    : "border border-transparent bg-white/70 opacity-[0.72] shadow-none",
                ].join(" ")}
              >
                {node ? (
                  <div className="space-y-3">
                    {!(node.type === "end" && outcomeKeyFromTitle(node.title)) ? (
                      <h2 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">{node.title}</h2>
                    ) : null}
                    {!(node.type === "end" && outcomeKeyFromTitle(node.title) && isActive) ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{node.body}</p>
                    ) : null}
                    {isActive && node.type === "end" ? (
                      <div className="mt-1 rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <div className="flex items-start gap-3">
                          <CheckCircle2
                            className="mt-0.5 shrink-0 text-emerald-600/90"
                            size={20}
                            strokeWidth={1.75}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800/65">
                              Veiksmas
                            </div>
                            <div className="text-base font-semibold leading-snug text-emerald-950">
                              {(() => {
                                const k = outcomeKeyFromTitle(node.title);
                                return k ? outcomeHintForKey(k) : "Užbaigti veiksmą (pagal susitarimą su klientu).";
                              })()}
                            </div>
                            <div className="text-xs leading-relaxed text-emerald-900/75">
                              Šis žingsnis pažymėtas kaip baigiamasis. Užfiksuok veiksmą CRM’e ir uždaryk skambutį.
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600">Nepavyko rasti žingsnio.</p>
                )}
              </div>

              {isActive ? (
                <div className="rounded-xl border border-zinc-200/60 bg-zinc-50/40 px-4 py-5">
                  {choices.length === 0 ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <CheckCircle2 className="shrink-0 text-zinc-400" size={16} strokeWidth={1.75} aria-hidden />
                        <span>Scenarijus užbaigtas</span>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg bg-[#7C4A57] px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-[#7C4A57]/20 transition-transform hover:bg-[#693948] active:translate-y-px"
                        onClick={onReset}
                      >
                        Pradėti iš naujo
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-3">
                      {choices.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="inline-flex min-h-[42px] max-w-full items-center justify-center rounded-lg border border-zinc-200/90 bg-white/90 px-4 text-sm font-medium text-zinc-800 shadow-sm transition-all duration-150 motion-safe:hover:-translate-y-px hover:border-zinc-300 hover:bg-white hover:shadow-md active:translate-y-0 active:border-zinc-400 active:bg-zinc-100"
                          onClick={() => onSelectChoice(c)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {options.length > 0 ? (
                    <div className="flex flex-wrap gap-2 px-0.5 sm:gap-3">
                      {options.map((opt) => {
                        const isPicked = Boolean(selected) && opt.label === selected;
                        return (
                          <span
                            key={opt.id}
                            className={[
                              "inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                              isPicked
                                ? "border-[#7C4A57] bg-[#7C4A57] text-white shadow-sm"
                                : "border-zinc-200/90 bg-white/80 text-zinc-500",
                            ].join(" ")}
                          >
                            <span className="truncate">{opt.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

