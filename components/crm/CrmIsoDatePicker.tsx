"use client";

import { Calendar } from "lucide-react";
import { useId, useRef, useState } from "react";

function normalizeIsoYmdInput(raw: string): string {
  return raw.replace(/[^\d-]/g, "").slice(0, 10);
}

function isIsoYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function CrmIsoDatePicker({
  name,
  defaultValue,
  required,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const id = useId();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(() => normalizeIsoYmdInput(String(defaultValue ?? "")));

  const openPicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    el.value = isIsoYmd(value) ? value : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEl = el as any;
    if (typeof anyEl.showPicker === "function") anyEl.showPicker();
    else el.focus();
  };

  return (
    <div className="relative w-full">
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="YYYY-MM-DD"
        value={value}
        onChange={(e) => setValue(normalizeIsoYmdInput(e.target.value))}
        onFocus={openPicker}
        required={required}
        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 pr-11 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      />

      <button
        type="button"
        onClick={openPicker}
        className="absolute right-3 top-0 h-10 w-8 inline-flex items-center justify-center text-slate-400 hover:text-slate-700"
        aria-label="Pasirinkti datą"
      >
        <Calendar className="h-4 w-4" />
      </button>

      <input
        ref={dateInputRef}
        type="date"
        value={isIsoYmd(value) ? value : ""}
        onChange={(e) => setValue(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute h-0 w-0 opacity-0 pointer-events-none"
      />
    </div>
  );
}
