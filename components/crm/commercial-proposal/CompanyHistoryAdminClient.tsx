"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";
import {
  deleteCompanyHistoryAction,
  listCompanyHistoryAdmin,
  reorderCompanyHistoryAction,
  setCompanyHistoryActiveAction,
  upsertCompanyHistoryAction,
} from "@/lib/crm/commercialProposalActions";
import type { CpCompanyHistoryEntry } from "@/lib/commercialProposal/types";

function validateHistoryFields(yearValue: string, bodyValue: string): { year?: string; body?: string } {
  const year = Number(yearValue);
  const errors: { year?: string; body?: string } = {};
  if (!Number.isFinite(year) || year < 1900 || year > 2100) errors.year = "Neteisingi metai.";
  if (!bodyValue.trim()) errors.body = "Tekstas privalomas.";
  return errors;
}

function mapServerFieldError(error: string): { year?: string; body?: string; general?: string } {
  if (error === "Neteisingi metai.") return { year: error };
  if (error === "Tekstas privalomas.") return { body: error };
  return { general: error };
}

const ICON_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#6F7077] hover:bg-[#F7F7F8] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";
const FIELD =
  "w-full rounded-[8px] border border-[#E8E8EB] bg-white px-3 text-[13px] text-[#17171B]";
const LABEL = "block text-[13px] font-medium text-[#5C5D64]";

function HistoryEntryMenu({
  open,
  onOpenChange,
  active,
  disabled,
  onEdit,
  onToggleActive,
  onDelete,
  autoFocusTrigger = false,
  onAutoFocused,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  disabled?: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  autoFocusTrigger?: boolean;
  onAutoFocused?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!autoFocusTrigger) return;
    btnRef.current?.focus();
    onAutoFocused?.();
  }, [autoFocusTrigger, onAutoFocused]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    function place() {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const b = btn.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const top = Math.min(b.bottom + 4, vh - mh - 8);
      const left = Math.max(8, Math.min(b.right - mw, vw - mw - 8));
      setCoords({ top: Math.max(8, top), left });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, mounted]);

  useLayoutEffect(() => {
    if (!open || !coords) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open, coords]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
      if (!items.length) return;
      e.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = (current + delta + items.length) % items.length;
      items[next]?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const menu =
    open && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        aria-label="Istorijos veiksmai"
        className="fixed z-[60] min-w-[160px] overflow-hidden rounded-[12px] border border-[#E8E8EB] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        style={{
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          visibility: coords ? "visible" : "hidden",
        }}
      >
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className="block w-full px-3 py-2 text-left text-[13px] text-[#17171B] hover:bg-[#F7F7F8] disabled:opacity-50"
          onClick={() => {
            onOpenChange(false);
            onEdit();
          }}
        >
          Redaguoti
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className="block w-full px-3 py-2 text-left text-[13px] text-[#17171B] hover:bg-[#F7F7F8] disabled:opacity-50"
          onClick={() => {
            onOpenChange(false);
            onToggleActive();
          }}
        >
          {active ? "Išjungti" : "Įjungti"}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={disabled}
          className="block w-full border-t border-[#E8E8EB] px-3 py-2 text-left text-[13px] text-red-700 hover:bg-red-50 disabled:opacity-50"
          onClick={() => {
            onOpenChange(false);
            onDelete();
          }}
        >
          Ištrinti
        </button>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={ICON_BTN}
        aria-label="Daugiau veiksmų"
        title="Daugiau veiksmų"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

export function CompanyHistoryAdminClient({
  initial,
  embedded = false,
  onChanged,
}: {
  initial: CpCompanyHistoryEntry[];
  embedded?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState(initial);
  const [year, setYear] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editYear, setEditYear] = useState("");
  const [editBody, setEditBody] = useState("");
  const [createErrors, setCreateErrors] = useState<{ year?: string; body?: string; general?: string }>({});
  const [editErrors, setEditErrors] = useState<{ year?: string; body?: string; general?: string }>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reorderBusy, setReorderBusy] = useState(false);
  const reorderLock = useRef(false);
  const editYearRef = useRef<HTMLInputElement>(null);
  const [focusActionFor, setFocusActionFor] = useState<string | null>(null);
  const actionsBusy = pending || reorderBusy;

  useEffect(() => {
    if (!embedded || !editingId) return;
    editYearRef.current?.focus();
  }, [embedded, editingId]);

  useEffect(() => {
    if (!embedded || !editingId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (menuFor) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA") && !e.defaultPrevented) {
        e.preventDefault();
      }
      setEditingId(null);
      setEditYear("");
      setEditBody("");
      setEditErrors({});
      setFocusActionFor(editingId);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [embedded, editingId, menuFor]);

  function showActionError(error: string) {
    if (embedded) setActionError(error);
    else setMessage(error);
  }

  async function moveRow(idx: number, dir: -1 | 1) {
    if (reorderLock.current) return;
    const current = rows[idx];
    const swap = rows[idx + dir];
    if (!current || !swap) return;
    const previous = rows;
    const next = rows.map((row, i) => {
      if (i === idx) return swap;
      if (i === idx + dir) return current;
      return row;
    });
    const confirmed = next.map((row, i) => ({ ...row, sort_order: (i + 1) * 10 }));

    reorderLock.current = true;
    setReorderBusy(true);
    setActionError(null);
    setMessage(null);
    setRows(confirmed);
    let succeeded = false;
    try {
      const res = await reorderCompanyHistoryAction(confirmed.map((row) => row.id));
      if (!res.ok) {
        setRows(previous);
        showActionError(res.error);
      } else {
        succeeded = true;
      }
    } catch {
      setRows(previous);
      showActionError("Nepavyko pakeisti tvarkos.");
    } finally {
      reorderLock.current = false;
      setReorderBusy(false);
    }
    if (succeeded) await onChanged?.();
  }

  async function createEntry() {
    const local = validateHistoryFields(year, body);
    if (local.year || local.body) {
      setCreateErrors(local);
      return;
    }
    setCreateErrors({});
    setActionError(null);
    start(async () => {
      try {
        const res = await upsertCompanyHistoryAction({
          year: Number(year),
          body,
          sort_order: (rows.length + 1) * 10,
          active: true,
        });
        if (!res.ok) {
          setCreateErrors(mapServerFieldError(res.error));
          return;
        }
        if (embedded || onChanged) {
          try {
            setRows(await listCompanyHistoryAdmin());
          } catch {
            setCreateErrors({ general: "Įrašas išsaugotas, bet sąrašo atnaujinti nepavyko." });
          }
          setYear("");
          setBody("");
          await onChanged?.();
          return;
        }
        window.location.reload();
      } catch {
        setCreateErrors({ general: "Nepavyko išsaugoti." });
      }
    });
  }

  async function toggleActive(row: CpCompanyHistoryEntry) {
    setActionError(null);
    setMessage(null);
    start(async () => {
      try {
        const nextActive = !row.active;
        const res = await setCompanyHistoryActiveAction(row.id, nextActive);
        if (!res.ok) {
          showActionError(res.error);
          return;
        }
        if (embedded || onChanged) {
          setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, active: nextActive } : item)));
          await onChanged?.();
          return;
        }
        window.location.reload();
      } catch {
        showActionError("Nepavyko pakeisti būsenos.");
      }
    });
  }

  async function removeEntry(row: CpCompanyHistoryEntry) {
    if (!confirm("Ištrinti šį istorijos įrašą?")) return;
    setActionError(null);
    setMessage(null);
    start(async () => {
      try {
        const res = await deleteCompanyHistoryAction(row.id);
        if (!res.ok) {
          showActionError(res.error);
          return;
        }
        if (embedded || onChanged) {
          setRows((prev) => prev.filter((item) => item.id !== row.id));
          if (editingId === row.id) {
            setEditingId(null);
            setEditYear("");
            setEditBody("");
            setEditErrors({});
          }
          await onChanged?.();
          return;
        }
        window.location.reload();
      } catch {
        showActionError("Nepavyko ištrinti.");
      }
    });
  }

  function beginEdit(row: CpCompanyHistoryEntry) {
    setMenuFor(null);
    setEditingId(row.id);
    setEditYear(String(row.year));
    setEditBody(row.body);
    setEditErrors({});
  }

  function cancelEdit() {
    const id = editingId;
    setEditingId(null);
    setEditYear("");
    setEditBody("");
    setEditErrors({});
    setFocusActionFor(id);
  }

  function saveEdit(row: CpCompanyHistoryEntry) {
    const local = validateHistoryFields(editYear, editBody);
    if (local.year || local.body) {
      setEditErrors(local);
      return;
    }
    setEditErrors({});
    setActionError(null);
    start(async () => {
      try {
        const nextYear = Number(editYear);
        const nextBody = editBody;
        const res = await upsertCompanyHistoryAction({
          id: row.id,
          year: nextYear,
          body: nextBody,
          sort_order: row.sort_order,
          active: row.active,
        });
        if (!res.ok) {
          setEditErrors(mapServerFieldError(res.error));
          return;
        }
        if (embedded || onChanged) {
          setRows((prev) =>
            prev.map((item) =>
              item.id === row.id ? { ...item, year: nextYear, body: nextBody.trim() } : item
            )
          );
          setEditingId(null);
          setEditYear("");
          setEditBody("");
          setFocusActionFor(row.id);
          await onChanged?.();
          return;
        }
        window.location.reload();
      } catch {
        setEditErrors({ general: "Nepavyko išsaugoti." });
      }
    });
  }

  if (embedded) {
    return (
      <section className="min-w-0 overflow-x-hidden">
        <h2 className="text-[13px] font-semibold text-[#17171B]">Istorijos įrašai</h2>
        <p className="mt-1 text-[12px] leading-5 text-[#6F7077]">
          Šie įrašai patenka į skiltį „Mūsų istorija“. Nauji metai pridedami čia.
        </p>

        <div className="mt-3 space-y-3">
          <label className="block min-w-0">
            <span className={LABEL}>Metai</span>
            <input
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setCreateErrors((prev) => ({ ...prev, year: undefined, general: undefined }));
              }}
              inputMode="numeric"
              autoComplete="off"
              className={`${FIELD} mt-1.5 h-10 max-w-[140px]`}
            />
            {createErrors.year ? <span className="mt-1 block text-[12px] text-red-700">{createErrors.year}</span> : null}
          </label>
          <label className="block min-w-0">
            <span className={LABEL}>Tekstas</span>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setCreateErrors((prev) => ({ ...prev, body: undefined, general: undefined }));
              }}
              placeholder="Be „YYYY metais“ prefikso"
              rows={4}
              className={`${FIELD} mt-1.5 min-h-[88px] py-2`}
            />
            {createErrors.body ? <span className="mt-1 block text-[12px] text-red-700">{createErrors.body}</span> : null}
          </label>
          {createErrors.general ? <p className="text-[12px] text-red-700">{createErrors.general}</p> : null}
          {actionError ? <p className="text-[12px] text-red-700">{actionError}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={actionsBusy}
              className="h-10 rounded-[8px] bg-[#7C4A57] px-4 text-[13px] font-medium text-white hover:bg-[#693948] disabled:opacity-50"
              onClick={() => void createEntry()}
            >
              Pridėti įrašą
            </button>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-[#E8E8EB] border-t border-[#E8E8EB]">
          {rows.map((r, idx) => {
            const editing = editingId === r.id;
            return (
              <li key={r.id} className={["min-w-0 py-4", r.active ? "" : "rounded-[8px] bg-[#F7F7F8]/80"].join(" ")}>
                {editing ? (
                  <div className="space-y-3">
                    <label className="block min-w-0">
                      <span className={LABEL}>Metai</span>
                      <input
                        ref={editYearRef}
                        value={editYear}
                        onChange={(e) => {
                          setEditYear(e.target.value);
                          setEditErrors((prev) => ({ ...prev, year: undefined, general: undefined }));
                        }}
                        inputMode="numeric"
                        autoComplete="off"
                        className={`${FIELD} mt-1.5 h-10 max-w-[140px]`}
                      />
                      {editErrors.year ? (
                        <span className="mt-1 block text-[12px] text-red-700">{editErrors.year}</span>
                      ) : null}
                    </label>
                    <label className="block min-w-0">
                      <span className={LABEL}>Tekstas</span>
                      <textarea
                        value={editBody}
                        onChange={(e) => {
                          setEditBody(e.target.value);
                          setEditErrors((prev) => ({ ...prev, body: undefined, general: undefined }));
                        }}
                        rows={4}
                        className={`${FIELD} mt-1.5 min-h-[88px] py-2`}
                      />
                      {editErrors.body ? (
                        <span className="mt-1 block text-[12px] text-red-700">{editErrors.body}</span>
                      ) : null}
                    </label>
                    {editErrors.general ? <p className="text-[12px] text-red-700">{editErrors.general}</p> : null}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="h-10 rounded-[8px] border border-[#E8E8EB] bg-white px-4 text-[13px] font-medium text-[#17171B] hover:bg-[#F7F7F8]"
                        onClick={cancelEdit}
                      >
                        Atšaukti
                      </button>
                      <button
                        type="button"
                        disabled={actionsBusy}
                        className="h-10 rounded-[8px] bg-[#7C4A57] px-4 text-[13px] font-medium text-white hover:bg-[#693948] disabled:opacity-50"
                        onClick={() => saveEdit(r)}
                      >
                        Išsaugoti
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <h3
                          className={[
                            "truncate text-[13px] font-semibold",
                            r.active ? "text-[#17171B]" : "text-[#6F7077]",
                          ].join(" ")}
                        >
                          {r.year} metais
                        </h3>
                        {r.active ? null : (
                          <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-[#E8E8EB] bg-white px-1.5 text-[11px] font-medium text-[#6F7077]">
                            Išjungtas
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          className={ICON_BTN}
                          disabled={actionsBusy || idx === 0}
                          aria-label="Perkelti aukštyn"
                          title="Perkelti aukštyn"
                          onClick={() => void moveRow(idx, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={ICON_BTN}
                          disabled={actionsBusy || idx === rows.length - 1}
                          aria-label="Perkelti žemyn"
                          title="Perkelti žemyn"
                          onClick={() => void moveRow(idx, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <HistoryEntryMenu
                          open={menuFor === r.id}
                          onOpenChange={(next) => setMenuFor(next ? r.id : null)}
                          active={r.active}
                          disabled={actionsBusy}
                          autoFocusTrigger={focusActionFor === r.id}
                          onAutoFocused={() => setFocusActionFor(null)}
                          onEdit={() => beginEdit(r)}
                          onToggleActive={() => void toggleActive(r)}
                          onDelete={() => void removeEntry(r)}
                        />
                      </div>
                    </div>
                    <p
                      className={[
                        "mt-2 text-[13px] leading-5 break-words",
                        r.active ? "text-[#17171B]" : "text-[#6F7077]",
                      ].join(" ")}
                    >
                      {r.body}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Istorijos įrašai</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Šie įrašai patenka į komercinio pasiūlymo skiltį „Mūsų istorija“. Nauji metai (2025, 2026, …) pridedami čia —
        PDF generatoriaus keisti nereikia.
      </p>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto]">
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Metai"
            className="h-9 rounded-lg border border-zinc-200 px-3 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tekstas (be „YYYY metais“ prefikso)"
            className="min-h-9 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            rows={2}
          />
          <button
            type="button"
            disabled={actionsBusy}
            className="h-9 rounded-lg bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={() => {
              setMessage(null);
              start(async () => {
                try {
                  const res = await upsertCompanyHistoryAction({
                    id: editingId ?? undefined,
                    year: Number(year),
                    body,
                    sort_order: editingId
                      ? rows.find((r) => r.id === editingId)?.sort_order ?? (rows.length + 1) * 10
                      : (rows.length + 1) * 10,
                    active: true,
                  });
                  if (!res.ok) {
                    setMessage(res.error);
                    return;
                  }
                  window.location.reload();
                } catch {
                  setMessage("Nepavyko išsaugoti.");
                }
              });
            }}
          >
            {editingId ? "Išsaugoti" : "Add"}
          </button>
        </div>
        {editingId ? (
          <button
            type="button"
            className="text-left text-xs text-zinc-500 hover:underline"
            onClick={() => {
              setEditingId(null);
              setYear("");
              setBody("");
            }}
          >
            Atšaukti redagavimą
          </button>
        ) : null}
        {message ? <p className="text-sm text-red-600">{message}</p> : null}
      </div>

      <ul className="mt-5 divide-y divide-zinc-100">
        {rows.map((r, idx) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-900">
                {r.year} metais {r.active ? "" : "(išjungta)"}
              </div>
              <p className="mt-1 text-sm text-zinc-700">{r.body}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 disabled:opacity-35"
                disabled={actionsBusy || idx === 0}
                onClick={() => void moveRow(idx, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 disabled:opacity-35"
                disabled={actionsBusy || idx === rows.length - 1}
                onClick={() => void moveRow(idx, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50"
                disabled={actionsBusy}
                onClick={() => {
                  setEditingId(r.id);
                  setYear(String(r.year));
                  setBody(r.body);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 disabled:opacity-50"
                disabled={actionsBusy}
                onClick={() => void toggleActive(r)}
              >
                {r.active ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={actionsBusy}
                onClick={() => void removeEntry(r)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
