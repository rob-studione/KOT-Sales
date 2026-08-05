"use client";

import { Calendar } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

function normalizeIsoYmdInput(raw: string): string {
  return raw.replace(/[^\d-]/g, "").slice(0, 10);
}

function isIsoYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function CrmIsoDatePicker({
  name,
  value,
  defaultValue,
  required,
  onValueChange,
  ariaLabel,
  containerClassName,
  inputClassName,
  buttonClassName,
}: {
  name: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  containerClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
}) {
  const id = useId();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [innerValue, setInnerValue] = useState(() => normalizeIsoYmdInput(String(value ?? defaultValue ?? "")));
  const currentValue = value != null ? normalizeIsoYmdInput(value) : innerValue;

  useEffect(() => {
    if (value == null) return;
    setInnerValue(normalizeIsoYmdInput(value));
  }, [value]);

  const setValue = (nextRaw: string) => {
    const next = normalizeIsoYmdInput(nextRaw);
    if (value == null) setInnerValue(next);
    onValueChange?.(next);
  };

  const openPicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    el.value = isIsoYmd(currentValue) ? currentValue : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEl = el as any;
    if (typeof anyEl.showPicker === "function") anyEl.showPicker();
    else el.focus();
  };

  return (
    <div className={containerClassName ?? "relative w-full"}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="YYYY-MM-DD"
        value={currentValue}
        onChange={(e) => setValue(e.target.value)}
        onFocus={openPicker}
        required={required}
        aria-label={ariaLabel}
        className={
          inputClassName ??
          "h-10 w-full rounded-xl border border-gray-300 bg-white px-3 pr-11 text-sm text-gray-900 outline-none focus:border-[#7C4A57] focus:ring-2 focus:ring-[#7C4A57]/10"
        }
      />

      <button
        type="button"
        onClick={openPicker}
        className={
          buttonClassName ??
          "absolute right-3 top-0 inline-flex h-10 w-8 items-center justify-center text-gray-400 hover:text-gray-700"
        }
        aria-label={ariaLabel ? `${ariaLabel} kalendorius` : "Pasirinkti datą"}
      >
        <Calendar className="h-4 w-4" />
      </button>

      <input
        ref={dateInputRef}
        type="date"
        value={isIsoYmd(currentValue) ? currentValue : ""}
        onChange={(e) => setValue(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute h-0 w-0 opacity-0 pointer-events-none"
      />
    </div>
  );
}
