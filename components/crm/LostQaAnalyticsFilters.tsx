"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type MailboxOption = {
  id: string;
  name: string;
  email_address: string;
};

type Props = {
  mailboxOptions: MailboxOption[];
  mailbox: string;
  mode: "day" | "range";
  preset: "today" | "yesterday" | "last7" | "last30" | "custom";
  date: string;
  from: string;
  to: string;
};

const BTN =
  "cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const ACTIVE = "border-zinc-900 bg-zinc-900 text-white";
const IDLE = "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function LostQaAnalyticsFilters(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function navigate(next: URLSearchParams) {
    const q = next.toString();
    startTransition(() => {
      router.push(q ? `${pathname}?${q}` : pathname);
    });
  }

  function withBase(): URLSearchParams {
    return new URLSearchParams(searchParams.toString());
  }

  function setMailbox(value: string) {
    const next = withBase();
    next.set("mailbox", value);
    navigate(next);
  }

  function setMode(value: "day" | "range") {
    const next = withBase();
    next.set("mode", value);
    if (value === "day") {
      next.set("preset", props.preset === "today" || props.preset === "yesterday" || props.preset === "custom" ? props.preset : "today");
      next.set("date", props.date);
      next.delete("from");
      next.delete("to");
    } else {
      next.set("preset", props.preset === "last7" || props.preset === "last30" || props.preset === "custom" ? props.preset : "last7");
      next.set("from", props.from);
      next.set("to", props.to);
      next.delete("date");
    }
    navigate(next);
  }

  function setPreset(value: Props["preset"]) {
    const next = withBase();
    next.set("preset", value);
    if (props.mode === "day") {
      if (value === "today") next.set("date", todayIso());
      else if (value === "yesterday") next.set("date", shiftDays(todayIso(), -1));
      else next.set("date", props.date);
    } else {
      if (value === "last7") {
        const today = todayIso();
        next.set("from", shiftDays(today, -6));
        next.set("to", today);
      } else if (value === "last30") {
        const today = todayIso();
        next.set("from", shiftDays(today, -29));
        next.set("to", today);
      } else {
        next.set("from", props.from);
        next.set("to", props.to);
      }
    }
    navigate(next);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            className={`${BTN} ${props.mode === "day" ? ACTIVE : IDLE}`}
            onClick={() => setMode("day")}
          >
            Diena
          </button>
          <button
            type="button"
            disabled={isPending}
            className={`${BTN} ${props.mode === "range" ? ACTIVE : IDLE}`}
            onClick={() => setMode("range")}
          >
            Intervalas
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          Pašto dėžutė
          <select
            value={props.mailbox}
            onChange={(e) => setMailbox(e.target.value)}
            disabled={isPending}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
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

      <div className="flex flex-wrap gap-2">
        {props.mode === "day" ? (
          <>
            <button type="button" disabled={isPending} className={`${BTN} ${props.preset === "today" ? ACTIVE : IDLE}`} onClick={() => setPreset("today")}>
              Šiandien
            </button>
            <button type="button" disabled={isPending} className={`${BTN} ${props.preset === "yesterday" ? ACTIVE : IDLE}`} onClick={() => setPreset("yesterday")}>
              Vakar
            </button>
            <button type="button" disabled={isPending} className={`${BTN} ${props.preset === "custom" ? ACTIVE : IDLE}`} onClick={() => setPreset("custom")}>
              Pasirinkta data
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={isPending} className={`${BTN} ${props.preset === "last7" ? ACTIVE : IDLE}`} onClick={() => setPreset("last7")}>
              Paskutinės 7 d.
            </button>
            <button type="button" disabled={isPending} className={`${BTN} ${props.preset === "last30" ? ACTIVE : IDLE}`} onClick={() => setPreset("last30")}>
              Paskutinės 30 d.
            </button>
            <button type="button" disabled={isPending} className={`${BTN} ${props.preset === "custom" ? ACTIVE : IDLE}`} onClick={() => setPreset("custom")}>
              Pasirinktas intervalas
            </button>
          </>
        )}
      </div>

      {props.mode === "day" && props.preset === "custom" ? (
        <form className="flex flex-wrap items-center gap-2" action={pathname} method="get">
          <input type="hidden" name="mailbox" value={props.mailbox} />
          <input type="hidden" name="mode" value="day" />
          <input type="hidden" name="preset" value="custom" />
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Data
            <input
              type="date"
              name="date"
              required
              defaultValue={props.date}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900"
            />
          </label>
          <button type="submit" className={`${BTN} ${IDLE}`}>
            Taikyti
          </button>
        </form>
      ) : null}

      {props.mode === "range" && props.preset === "custom" ? (
        <form className="flex flex-wrap items-center gap-2" action={pathname} method="get">
          <input type="hidden" name="mailbox" value={props.mailbox} />
          <input type="hidden" name="mode" value="range" />
          <input type="hidden" name="preset" value="custom" />
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Nuo
            <input
              type="date"
              name="from"
              required
              defaultValue={props.from}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Iki
            <input
              type="date"
              name="to"
              required
              defaultValue={props.to}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900"
            />
          </label>
          <button type="submit" className={`${BTN} ${IDLE}`}>
            Taikyti
          </button>
        </form>
      ) : null}
    </div>
  );
}

