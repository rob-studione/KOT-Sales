"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function isOverflowing(el: HTMLElement): boolean {
  // Works for both single-line truncate and multi-line line-clamp (height overflow).
  return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
}

export function TruncateTooltip({
  text,
  className,
  tooltipClassName,
  delayMs = 150,
}: {
  /** Tooltip text. If empty, tooltip is disabled. */
  text: string;
  /** Applies to the content element (the truncating element). */
  className?: string;
  /** Optional extra classes for tooltip bubble. */
  tooltipClassName?: string;
  /** Hover delay before showing tooltip. */
  delayMs?: number;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [eligible, setEligible] = useState(false);

  const tooltipText = useMemo(() => String(text ?? "").trim(), [text]);

  useEffect(() => {
    // Close tooltip if text changes while open.
    setOpen(false);
  }, [tooltipText]);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function onEnter() {
    clearTimer();
    if (!tooltipText) return;
    const el = contentRef.current;
    if (!el) return;
    const canShow = isOverflowing(el);
    setEligible(canShow);
    if (!canShow) return;
    timerRef.current = window.setTimeout(() => setOpen(true), Math.max(0, delayMs));
  }

  function onLeave() {
    clearTimer();
    setOpen(false);
  }

  return (
    <span className="relative block min-w-0 w-full" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div ref={contentRef} className={["min-w-0 w-full", className ?? ""].filter(Boolean).join(" ")}>
        {tooltipText || "—"}
      </div>
      {open && eligible ? (
        <div
          role="tooltip"
          className={[
            "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[320px] -translate-x-1/2",
            "rounded-md bg-zinc-900 px-3 py-2 text-sm text-white shadow-lg",
            "break-words",
            tooltipClassName ?? "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {tooltipText}
        </div>
      ) : null}
    </span>
  );
}

