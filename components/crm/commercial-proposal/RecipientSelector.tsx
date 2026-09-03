"use client";

import { useEffect, useId, useRef, useState, useTransition, type Ref } from "react";
import { Plus, Search } from "lucide-react";
import { recipientInitials } from "@/components/crm/commercial-proposal/studio/shared";
import { getFocusable, lockStudioScroll } from "@/components/crm/commercial-proposal/studio/lockStudioScroll";
import {
  getProposalRecipientOptionAction,
  listManualProjectsForProposalAction,
  searchAllProposalRecipientsAction,
  type ProposalRecipientOption,
} from "@/lib/crm/commercialProposalActions";
import { createManualProjectLeadAction } from "@/lib/crm/projectActions";

const GAVEJAS_BADGE_CLASS =
  "inline-flex shrink-0 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide";

function TypeBadge({ type, kanban }: { type: "client" | "lead"; kanban?: boolean }) {
  const label = type === "client" ? "Klientas" : kanban ? "Kanban" : "Leadas";
  return (
    <span
      data-gavejas-badge="badge"
      className={[
        GAVEJAS_BADGE_CLASS,
        type === "client" ? "border-[#E8E8EB] bg-[#F7F7F8] text-[#6F7077]" : "border-[#7C4A57]/20 bg-[#F7EEF0] text-[#7C4A57]",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function ResultRow({
  row,
  onSelect,
}: {
  row: ProposalRecipientOption;
  onSelect: (row: ProposalRecipientOption) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-[#F7F7F8]"
      onClick={() => onSelect(row)}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[#17171B]">{row.recipientName}</span>
        <span className="mt-0.5 block truncate text-[12px] text-[#6F7077]">
          {[row.contactName, row.email, row.companyCode, row.projectName].filter(Boolean).join(" · ") || "—"}
        </span>
      </span>
      <TypeBadge type={row.recipientType} kanban={Boolean(row.workItemId)} />
    </button>
  );
}

function QuickCreateLeadModal({
  initialName,
  returnFocusTo,
  onClose,
  onCreated,
}: {
  initialName: string;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onCreated: (row: ProposalRecipientOption) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState("");
  const [companyName, setCompanyName] = useState(initialName);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [matches, setMatches] = useState<ProposalRecipientOption[]>([]);

  useEffect(() => {
    void listManualProjectsForProposalAction()
      .then((rows) => {
        setProjects(rows);
      })
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    const q = companyName.trim();
    if (q.length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchAllProposalRecipientsAction(q)
        .then((rows) => {
          if (!cancelled) setMatches(rows.slice(0, 5));
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [companyName]);

  useEffect(() => {
    const unlock = lockStudioScroll();
    const dialog = dialogRef.current;
    const id = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLInputElement>("input:not([type='hidden'])")?.focus();
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const nodes = getFocusable(dialog);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
      unlock();
      returnFocusTo?.focus();
    };
  }, [onClose, returnFocusTo]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-lead-title"
        className="w-full max-w-md rounded-[16px] border border-[#E8E8EB] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <h2 id="quick-lead-title" className="text-[16px] font-semibold text-[#17171B]">
          Sukurti naują gavėją
        </h2>
        <p className="mt-1 text-[13px] text-[#6F7077]">Naujas įrašas bus sukurtas CRM, tada parinktas kaip gavėjas.</p>

        <label className="mt-4 block text-sm">
          <span className="text-[12px] font-medium text-[#6F7077]">Įmonė arba vardas</span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 h-10 w-full rounded-[10px] border border-[#E8E8EB] px-3 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-[12px] font-medium text-[#6F7077]">Kontaktinis asmuo</span>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="mt-1 h-10 w-full rounded-[10px] border border-[#E8E8EB] px-3 text-sm"
          />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[12px] font-medium text-[#6F7077]">El. paštas</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-10 w-full rounded-[10px] border border-[#E8E8EB] px-3 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[12px] font-medium text-[#6F7077]">Telefonas</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 h-10 w-full rounded-[10px] border border-[#E8E8EB] px-3 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-[12px] font-medium text-[#6F7077]">Projektas *</span>
          {projects.length === 0 ? (
            <p className="mt-1 text-[13px] text-[#5C5D64]">
              Nėra tinkamo rankinio projekto, todėl naujo lead sukurti negalima.{" "}
              <a href="/projektai/naujas" className="text-[#7C4A57] hover:underline">
                Sukurti projektą
              </a>
            </p>
          ) : (
            <select
              required
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 h-10 w-full rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm"
            >
              <option value="">Pasirinkite projektą</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-[12px] text-[#5C5D64]">
            Leadas visada priklauso rankiniam projektui — be projekto įrašo sukurti negalima.
          </p>
        </label>

        {matches.length > 0 ? (
          <div className="mt-3 rounded-[12px] border border-[#E8E8EB]">
            <div className="px-3 py-2 text-[12px] font-medium text-[#6F7077]">Panašūs įrašai</div>
            {matches.map((row) => (
              <ResultRow key={`${row.recipientType}-${row.recipientId}`} row={row} onSelect={onCreated} />
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:underline" onClick={onClose}>
            Atšaukti
          </button>
          <button
            type="button"
            disabled={pending || !companyName.trim() || !projectId}
            className="inline-flex h-9 items-center rounded-[10px] bg-[#7C4A57] px-3.5 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={() => {
              setError(null);
              start(async () => {
                const fd = new FormData();
                fd.set("project_id", projectId);
                fd.set("company_name", companyName.trim());
                fd.set("contact_name", contactName.trim());
                fd.set("email", email.trim());
                fd.set("phone", phone.trim());
                const res = await createManualProjectLeadAction(fd);
                if (!res.ok) {
                  if ("existingProjectLead" in res && res.existingProjectLead) {
                    const existing = await getProposalRecipientOptionAction({
                      recipientType: "lead",
                      recipientId: res.lead.id,
                    });
                    if (existing) {
                      onCreated(existing);
                      return;
                    }
                  }
                  setError("error" in res && res.error ? res.error : "Nepavyko sukurti lead.");
                  return;
                }
                if (!res.id) {
                  setError("Leadas sukurtas, bet nepavyko jo parinkti.");
                  return;
                }
                const option = await getProposalRecipientOptionAction({ recipientType: "lead", recipientId: res.id });
                if (!option) {
                  setError("Leadas sukurtas, bet nepavyko jo parinkti.");
                  return;
                }
                onCreated(option);
              });
            }}
          >
            Sukurti ir parinkti
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecipientSelector({
  selected,
  onSelect,
  onClear,
  disabled,
  autoFocus,
}: {
  selected: ProposalRecipientOption | null;
  onSelect: (row: ProposalRecipientOption) => void;
  onClear: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProposalRecipientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      searchAllProposalRecipientsAction(q)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Paieška nepavyko.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, selected]);

  return (
    <div>
      {selected ? (
        <div>
          <SelectedRecipientControl recipient={selected} disabled={disabled} />
          {!disabled ? (
            <button
              type="button"
              className="mt-2 text-[12px] font-medium text-[#7C4A57] hover:underline"
              onClick={() => {
                setQuery("");
                setResults([]);
                onClear();
                window.requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              Keisti gavėją
            </button>
          ) : null}
        </div>
      ) : (
        <label className="block text-sm">
          <span className="text-[12px] font-medium text-[#6F7077]">Ieškoti kliento arba lead</span>
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#989AA2]" />
            <input
              ref={inputRef}
              value={query}
              disabled={disabled}
              autoFocus={autoFocus}
              placeholder="Vardas, įmonė, el. paštas…"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              className="h-10 w-full rounded-[10px] border border-[#E8E8EB] bg-white pl-9 pr-3 text-sm"
              onChange={(e) => {
                setError(null);
                setQuery(e.target.value);
              }}
            />
          </span>
        </label>
      )}

      {searching ? <p className="mt-2 text-[12px] text-[#6F7077]">Ieškoma…</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {!selected && results.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-[12px] border border-[#E8E8EB] bg-white">
          <div id={listboxId} role="listbox" className="max-h-64 overflow-y-auto">
            {results.map((row) => (
              <ResultRow
                key={`${row.recipientType}-${row.workItemId || row.recipientId}`}
                row={row}
                onSelect={(next) => {
                  onSelect(next);
                  setResults([]);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t border-[#EEEEF0] px-3 py-2.5 text-left text-sm font-medium text-[#7C4A57] hover:bg-[#FBF6F7]"
            onClick={() => setOpenCreate(true)}
          >
            <Plus className="h-4 w-4" />
            Sukurti naują gavėją
          </button>
        </div>
      ) : null}

      {!selected && !searching && query.trim().length >= 2 && results.length === 0 ? (
        <div className="mt-2 rounded-[12px] border border-[#E8E8EB] bg-white px-3 py-3">
          <p className="text-sm text-[#17171B]">Gavėjo neradome. Sukurti naują leadą?</p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#7C4A57] hover:underline"
            onClick={() => setOpenCreate(true)}
          >
            <Plus className="h-4 w-4" />
            Sukurti naują gavėją
          </button>
        </div>
      ) : null}

      {!selected && query.trim().length < 2 ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#7C4A57] hover:underline"
          onClick={() => setOpenCreate(true)}
        >
          <Plus className="h-4 w-4" />
          Sukurti naują gavėją
        </button>
      ) : null}

      {openCreate ? (
        <QuickCreateLeadModal
          initialName={query.trim()}
          returnFocusTo={inputRef.current}
          onClose={() => setOpenCreate(false)}
          onCreated={(row) => {
            setOpenCreate(false);
            onSelect(row);
            setResults([]);
          }}
        />
      ) : null}
    </div>
  );
}

export function RecipientTypeBadge({ type, kanban }: { type: "client" | "lead"; kanban?: boolean }) {
  return <TypeBadge type={type} kanban={kanban} />;
}

export function recipientCardHref(
  row: Pick<ProposalRecipientOption, "recipientType" | "clientId" | "projectId" | "workItemId">
): string | null {
  if (row.recipientType === "client" && row.clientId) {
    return `/klientai/${encodeURIComponent(row.clientId)}`;
  }
  if (row.workItemId && row.projectId) {
    return `/projektai/${row.projectId}/darbas`;
  }
  if (row.recipientType === "lead" && row.projectId) {
    return `/projektai/${row.projectId}/kandidatai`;
  }
  return null;
}

export function recipientCardLabel(type: "client" | "lead"): string {
  return type === "lead" ? "Atidaryti leado įrašą ↗" : "Atidaryti kliento kortelę ↗";
}

export function SelectedRecipientControl({
  recipient,
  disabled,
  buttonRef,
  expanded,
  size,
  onClick,
}: {
  recipient: ProposalRecipientOption;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  expanded?: boolean;
  size?: "default" | "studio";
  onClick?: () => void;
}) {
  const contact = recipient.contactName?.trim() || "";
  const companyName = recipient.recipientName.trim();
  const displayName = contact && contact !== companyName ? contact : companyName;
  const company = contact && contact !== companyName ? companyName : null;
  const studio = size === "studio";
  const name = displayName || recipient.recipientName;
  const avatar = (
    <span
      aria-hidden
      data-gavejas-avatar={studio ? "avatar" : undefined}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[#F7EEF0] font-semibold text-[#7C4A57]",
        studio ? "text-[12px]" : "h-9 w-9 text-[11px]",
      ].join(" ")}
    >
      {recipientInitials(name)}
    </span>
  );
  const identity = studio ? (
    <span data-gavejas-identity="identity">
      <span data-gavejas-name="name" className="text-left text-sm font-semibold text-[#17171B]" title={name}>
        {name}
      </span>
      <TypeBadge type={recipient.recipientType} kanban={Boolean(recipient.workItemId)} />
      {company ? (
        <span className="min-w-0 truncate text-left text-[12px] text-[#5C5D64]" title={company}>
          {company}
        </span>
      ) : null}
    </span>
  ) : (
    <>
      {avatar}
      <span className="min-w-0 overflow-hidden text-left">
        <span className="block truncate text-sm font-semibold text-[#17171B]" title={name}>
          {name}
        </span>
        {company ? (
          <span className="mt-0.5 block truncate text-[12px] text-[#5C5D64]" title={company}>
            {company}
          </span>
        ) : null}
      </span>
      <TypeBadge type={recipient.recipientType} kanban={Boolean(recipient.workItemId)} />
    </>
  );
  const keisti = !disabled && onClick ? (
    <span className="whitespace-nowrap text-[13px] font-medium text-[#7C4A57] hover:underline">Keisti</span>
  ) : null;
  if (studio) {
    const row = (
      <>
        {avatar}
        {identity}
        <span data-gavejas-action="action">{keisti}</span>
      </>
    );
    if (disabled || !onClick) {
      return <div data-gavejas-row="row">{row}</div>;
    }
    return (
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={expanded ?? false}
        aria-haspopup="dialog"
        aria-label="Keisti gavėją"
        data-gavejas-row="row"
        className="min-h-14 w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left"
        onClick={onClick}
      >
        {row}
      </button>
    );
  }
  const cls = "flex w-full items-center gap-3 rounded-[12px] border border-[#E8E8EB] bg-[#FBFBFB] px-3 py-2 text-left";
  const body = (
    <>
      {identity}
      <span className="min-w-2 flex-1" />
      {keisti}
    </>
  );
  if (disabled || !onClick) {
    return <div className={cls}>{body}</div>;
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      role="combobox"
      aria-expanded={expanded ?? false}
      aria-haspopup="dialog"
      aria-label="Keisti gavėją"
      className={`${cls} hover:border-[#D4D4D8] hover:bg-[#F7F7F8]`}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

export function RecipientPickerDialog({
  current,
  returnFocusTo,
  onClose,
  onPicked,
}: {
  current: ProposalRecipientOption | null;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onPicked: (row: ProposalRecipientOption) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<ProposalRecipientOption | null>(null);
  const pendingRef = useRef<ProposalRecipientOption | null>(null);
  pendingRef.current = pending;

  useEffect(() => {
    const unlock = lockStudioScroll();
    const dialog = dialogRef.current;
    const id = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLInputElement>("input:not([type='hidden'])")?.focus();
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const nested = (e.target as HTMLElement | null)?.closest("[aria-modal='true']");
        if (nested && nested !== dialog) return;
        e.preventDefault();
        e.stopPropagation();
        if (pendingRef.current) {
          setPending(null);
          return;
        }
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const nodes = getFocusable(dialog);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
      unlock();
      returnFocusTo?.focus();
    };
  }, [onClose, returnFocusTo]);

  useEffect(() => {
    if (!pending) return;
    const id = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-recipient-confirm]")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [pending]);

  function pick(row: ProposalRecipientOption) {
    if (
      current &&
      (current.recipientType !== row.recipientType || current.recipientId !== row.recipientId)
    ) {
      setPending(row);
      return;
    }
    if (current && current.recipientType === row.recipientType && current.recipientId === row.recipientId) {
      onClose();
      return;
    }
    onPicked(row);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipient-picker-title"
        className="w-full max-w-xl rounded-[16px] border border-[#E8E8EB] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        {pending ? (
          <>
            <h2 id="recipient-picker-title" className="text-[16px] font-semibold text-[#17171B]">
              Pakeisti gavėją?
            </h2>
            <p className="mt-3 text-[13px] text-[#6F7077]">Paslaugos, kainos ir nuolaidos liks tos pačios.</p>
            <div className="mt-4 grid gap-2">
              <div className="rounded-[12px] border border-[#E8E8EB] bg-[#F7F7F8] px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[#6F7077]">Dabar</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[#17171B]">{current?.recipientName}</span>
                  {current ? <TypeBadge type={current.recipientType} /> : null}
                </div>
              </div>
              <div className="rounded-[12px] border border-[#7C4A57]/20 bg-[#FBF6F7] px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[#7C4A57]">Naujas</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[#17171B]">{pending.recipientName}</span>
                  <TypeBadge type={pending.recipientType} />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:underline"
                onClick={() => setPending(null)}
              >
                Atšaukti
              </button>
              <button
                type="button"
                data-recipient-confirm
                className="inline-flex h-9 items-center rounded-[10px] bg-[#7C4A57] px-3.5 text-sm font-medium text-white hover:bg-[#693948]"
                onClick={() => onPicked(pending)}
              >
                Pakeisti
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="recipient-picker-title" className="text-[16px] font-semibold text-[#17171B]">
              Pasirinkti gavėją
            </h2>
            <p className="mt-1 text-[13px] text-[#6F7077]">
              {current
                ? `Dabar: ${current.recipientName}. Pasirinkite kitą klientą arba leadą.`
                : "Pasirinkite esamą klientą arba leadą."}
            </p>
            <div className="mt-4">
              <RecipientSelector selected={null} onSelect={pick} onClear={() => undefined} autoFocus />
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:underline" onClick={onClose}>
                Atšaukti
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
