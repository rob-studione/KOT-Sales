"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CrmIsoDatePicker } from "@/components/crm/CrmIsoDatePicker";
import { PeriodFilterCalendarIcon } from "@/components/crm/PeriodFilterCalendarIcon";
import type { ManagerKpiPreset } from "@/lib/crm/managerKpiPeriods";

type MailboxOption = {
  id: string;
  name: string;
  email_address: string;
};

type Props = {
  mailboxOptions: MailboxOption[];
  mailbox: string;
  period: ManagerKpiPreset;
  from: string;
  to: string;
};

type QuickPreset = Exclude<ManagerKpiPreset, "custom">;

const PRESETS: Array<{ id: QuickPreset; label: string }> = [
  { id: "today", label: "Šiandien" },
  { id: "week", label: "Ši savaitė" },
  { id: "month", label: "Šis mėnuo" },
  { id: "prev_month", label: "Praėjęs mėnuo" },
  { id: "year", label: "Šie metai" },
  { id: "all_time", label: "Visas laikotarpis" },
];

const PERIOD_LABEL: Record<ManagerKpiPreset, string> = {
  today: "Šiandien",
  week: "Ši savaitė",
  month: "Šis mėnuo",
  prev_month: "Praėjęs mėnuo",
  year: "Šie metai",
  all_time: "Visas laikotarpis",
  custom: "Pasirinktas intervalas",
};

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function LostQaAnalyticsFilters(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);

  function navigate(next: URLSearchParams) {
    const q = next.toString();
    startTransition(() => {
      router.push(q ? `${pathname}?${q}` : pathname);
    });
  }

  function withBase(): URLSearchParams {
    return new URLSearchParams(searchParams.toString());
  }

  useEffect(() => {
    setFrom(props.from);
    setTo(props.to);
  }, [props.from, props.to]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (!root.contains(target)) setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function setMailbox(value: string) {
    const next = withBase();
    next.set("mailbox", value);
    navigate(next);
  }

  function setPeriod(value: QuickPreset) {
    if (isPending) return;
    setOpen(false);
    if (value === props.period) return;
    const next = withBase();
    next.set("period", value);
    next.delete("preset");
    next.delete("mode");
    next.delete("date");
    next.delete("from");
    next.delete("to");
    navigate(next);
  }

  function applyCustomRange() {
    if (isPending) return;
    if (!isIsoDate(from) || !isIsoDate(to)) return;
    const ordered = from <= to ? { from, to } : { from: to, to: from };
    setOpen(false);
    const next = withBase();
    next.set("period", "custom");
    next.set("from", ordered.from);
    next.set("to", ordered.to);
    next.delete("preset");
    next.delete("mode");
    next.delete("date");
    navigate(next);
  }

  const applyDisabled = !isIsoDate(from) || !isIsoDate(to) || isPending;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div ref={rootRef} className="relative">
          <button
            type="button"
            aria-expanded={open}
            disabled={isPending}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm shadow-black/5 hover:bg-zinc-50 disabled:opacity-50"
          >
            <PeriodFilterCalendarIcon className="shrink-0 text-zinc-400" />
            {PERIOD_LABEL[props.period]}
            <span className={`text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
          </button>

          {open ? (
            <div className="absolute left-0 z-20 mt-2 w-[22rem] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl shadow-black/10 sm:left-full sm:ml-2 sm:mt-0 sm:top-0">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Laikotarpis</div>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => setPeriod(p.id)}
                    className={
                      props.period === p.id
                        ? "rounded-md border border-[#7C4A57] bg-white px-2.5 py-2 text-left text-sm font-medium text-[#7C4A57]"
                        : "rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 border-t border-zinc-100 pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Pasirinktas intervalas</div>
                <div className="flex items-center gap-2">
                  <CrmIsoDatePicker
                    name="from_local"
                    value={from}
                    onValueChange={setFrom}
                    ariaLabel="Nuo"
                    inputClassName="h-9 w-full rounded-md border border-zinc-200 px-2 py-1 pr-8 text-sm text-zinc-900 outline-none focus:border-[#7C4A57] focus:ring-2 focus:ring-[#7C4A57]/10"
                    buttonClassName="absolute right-1 top-0 inline-flex h-9 w-7 items-center justify-center text-zinc-400 hover:text-zinc-700"
                  />
                  <span className="text-zinc-400">–</span>
                  <CrmIsoDatePicker
                    name="to_local"
                    value={to}
                    onValueChange={setTo}
                    ariaLabel="Iki"
                    inputClassName="h-9 w-full rounded-md border border-zinc-200 px-2 py-1 pr-8 text-sm text-zinc-900 outline-none focus:border-[#7C4A57] focus:ring-2 focus:ring-[#7C4A57]/10"
                    buttonClassName="absolute right-1 top-0 inline-flex h-9 w-7 items-center justify-center text-zinc-400 hover:text-zinc-700"
                  />
                </div>
                <button
                  type="button"
                  disabled={applyDisabled}
                  onClick={applyCustomRange}
                  className="mt-2 h-9 rounded-md bg-[#7C4A57] px-3 text-sm font-medium text-white hover:bg-[#693948] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
                >
                  Taikyti
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          Pašto dėžutė
          <select
            value={props.mailbox}
            onChange={(e) => setMailbox(e.target.value)}
            disabled={isPending}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-[#7C4A57] focus:ring-2 focus:ring-[#7C4A57]/10 disabled:opacity-50"
          >
            <option value="all">Visos</option>
            {props.mailboxOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.email_address})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-zinc-500 sm:text-right">
        Rodoma: <span className="font-medium text-zinc-700">{props.from}</span> —{" "}
        <span className="font-medium text-zinc-700">{props.to}</span>
      </p>
    </div>
  );
}
