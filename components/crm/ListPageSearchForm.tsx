"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function hrefForLiveSearch(opts: {
  action: string;
  hiddenFields: Record<string, string>;
  queryParamName: string;
  query: string;
  /** Query parametrai, kuriuos nuimame keičiant paiešką (pvz. page), prieš taikant hiddenFields. */
  resetParams?: string[];
}): string {
  const u = new URL(opts.action, "https://local.invalid");
  // Visada nuimame statusą / puslapį — jei reikia, hiddenFields juos grąžins.
  const reset = new Set([
    ...(opts.resetParams ?? ["page", "completedPage"]),
    "candidateStatus",
  ]);
  for (const p of reset) {
    u.searchParams.delete(p);
  }
  for (const [k, v] of Object.entries(opts.hiddenFields)) {
    if (v !== "") u.searchParams.set(k, v);
  }
  const q = opts.query.trim();
  if (q) u.searchParams.set(opts.queryParamName, q);
  else u.searchParams.delete(opts.queryParamName);
  return `${u.pathname}${u.search}`;
}

/**
 * Gyva sąrašo paieška (debounce). Tuščia / Escape / native ✕ → atstato be paieškos parametro.
 */
export function ListPageSearchForm({
  action,
  defaultQuery,
  placeholder = "Įveskite paieškos užklausą",
  inputId,
  hiddenFields,
  size = "compact",
  className = "",
  queryParamName = "q",
  resetParams,
}: {
  action: string;
  defaultQuery: string;
  placeholder?: string;
  inputId: string;
  hiddenFields: Record<string, string>;
  size?: "compact" | "regular";
  className?: string;
  /** GET lauko vardas (numatytai `q`; „Užbaigta“ — `completedQ`). */
  queryParamName?: string;
  /** Papildomi parametrai, kuriuos nuimame keičiant paiešką. */
  resetParams?: string[];
}) {
  const router = useRouter();
  const isRegular = size === "regular";
  const [value, setValue] = useState(defaultQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigateRef = useRef<(raw: string) => void>(() => {});

  useEffect(() => {
    setValue(defaultQuery);
  }, [defaultQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const navigateForQuery = (raw: string) => {
    const next = hrefForLiveSearch({
      action,
      hiddenFields,
      queryParamName,
      query: raw,
      resetParams,
    });
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return;
    router.push(next, { scroll: false });
  };
  navigateRef.current = navigateForQuery;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onNativeSearch = () => {
      if ((el.value ?? "").trim()) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setValue("");
      navigateRef.current("");
    };
    el.addEventListener("search", onNativeSearch);
    return () => el.removeEventListener("search", onNativeSearch);
  }, []);

  const scheduleNavigate = (raw: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigateForQuery(raw), 280);
  };

  return (
    <div
      className={[
        "flex w-full shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        isRegular ? "max-w-[min(100%,21rem)] sm:max-w-[24rem]" : "max-w-[min(100%,17rem)] sm:max-w-[20.5rem]",
        className,
      ].join(" ")}
    >
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-[#7C4A57]">
          <SearchIcon className="block" />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={placeholder}
          className={[
            "w-full min-w-0 border-0 bg-transparent py-0 pl-8 pr-2 text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:ring-0",
            isRegular ? "h-10 text-sm" : "h-8 text-xs",
          ].join(" ")}
          onChange={(e) => {
            const next = e.currentTarget.value;
            setValue(next);
            scheduleNavigate(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (debounceRef.current) clearTimeout(debounceRef.current);
              navigateForQuery(value);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setValue("");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              navigateForQuery("");
            }
          }}
        />
      </div>
    </div>
  );
}
