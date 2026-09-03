"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateCommercialProposalAction,
  getExpressProposalContextAction,
  prepareExpressProposalAction,
  type ExpressProposalContext,
  type ExpressProposalSummary,
  type ProposalRecipientOption,
} from "@/lib/crm/commercialProposalActions";
import type { ExpressPendingLead } from "@/lib/crm/expressProcurementRecipient";
import { commercialProposalPath } from "@/lib/crm/commercialProposalPaths";
import {
  normalizeCategoryDiscounts,
  parseDiscountInput,
  type CpCategoryDiscounts,
} from "@/lib/commercialProposal/discounts";
import { CP_CATEGORIES, type CpPriceCategory } from "@/lib/commercialProposal/types";
import { recipientInitials } from "@/components/crm/commercial-proposal/studio/shared";
import { ExpressCategoryAccordion } from "@/components/crm/commercial-proposal/ExpressCategoryAccordion";
import { PricingGroupPicker } from "@/components/crm/commercial-proposal/PricingGroupPicker";
import { defaultPricingGroup, type CpPricingGroup } from "@/lib/crm/pricingGroups";
import { getFocusable, lockStudioScroll } from "@/components/crm/commercial-proposal/studio/lockStudioScroll";
import { triggerProposalPdfDownload } from "@/lib/crm/expressProposal";

type View = "form" | "success" | "generated";

const SESSION_PREFIX = "cp-express-kanban-return:";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#7C4A57] focus-visible:ring-offset-2";

const BTN_GHOST = `h-10 rounded-[10px] px-3 text-sm font-medium text-[#5C5D64] hover:bg-[#F7F7F8] disabled:opacity-50 ${FOCUS_RING}`;
const BTN_SECONDARY = `h-10 rounded-[10px] border border-[#E8E8EB] bg-white px-4 text-sm font-medium text-[#17171B] hover:bg-[#F7F7F8] disabled:opacity-50 ${FOCUS_RING}`;
const BTN_PRIMARY = `h-10 rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50 ${FOCUS_RING}`;

export function rememberKanbanExpressReturn(projectId: string, workItemId: string, reopenDrawer: boolean) {
  try {
    sessionStorage.setItem(
      `${SESSION_PREFIX}${projectId}`,
      JSON.stringify({
        workItemId,
        reopenDrawer,
        scrollY: window.scrollY,
        search: window.location.search,
      })
    );
  } catch {
    /* ignore */
  }
}

export function consumeKanbanExpressReturn(projectId: string): {
  workItemId: string;
  reopenDrawer: boolean;
  scrollY: number;
} | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${projectId}`);
    if (!raw) return null;
    sessionStorage.removeItem(`${SESSION_PREFIX}${projectId}`);
    const parsed = JSON.parse(raw) as { workItemId?: string; reopenDrawer?: boolean; scrollY?: number };
    if (!parsed.workItemId) return null;
    return {
      workItemId: parsed.workItemId,
      reopenDrawer: Boolean(parsed.reopenDrawer),
      scrollY: Number(parsed.scrollY) || 0,
    };
  } catch {
    return null;
  }
}

function discountsFromEnabled(
  enabled: Record<CpPriceCategory, boolean>,
  inputs: Record<CpPriceCategory, string>
): { ok: true; discounts: CpCategoryDiscounts } | { ok: false; fieldErrors: Partial<Record<CpPriceCategory, string>> } {
  const fieldErrors: Partial<Record<CpPriceCategory, string>> = {};
  const raw: Partial<CpCategoryDiscounts> = {};
  for (const c of CP_CATEGORIES) {
    if (!enabled[c]) {
      raw[c] = 0;
      continue;
    }
    const parsed = parseDiscountInput(inputs[c]);
    if (!parsed.ok) fieldErrors[c] = parsed.error;
    else raw[c] = parsed.value;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, discounts: normalizeCategoryDiscounts(raw) };
}

function matchingGroupId(groups: CpPricingGroup[], discounts: CpCategoryDiscounts): string | null {
  return (
    groups.find(
      (g) =>
        g.discounts.translation === discounts.translation &&
        g.discounts.ai_translation === discounts.ai_translation &&
        g.discounts.additional_service === discounts.additional_service
    )?.id ?? null
  );
}

function formFromDiscounts(d: CpCategoryDiscounts): {
  enabled: Record<CpPriceCategory, boolean>;
  inputs: Record<CpPriceCategory, string>;
} {
  return {
    enabled: {
      translation: d.translation > 0,
      ai_translation: d.ai_translation > 0,
      additional_service: d.additional_service > 0,
    },
    inputs: {
      translation: d.translation > 0 ? String(d.translation) : "",
      ai_translation: d.ai_translation > 0 ? String(d.ai_translation) : "",
      additional_service: d.additional_service > 0 ? String(d.additional_service) : "",
    },
  };
}

function liveDiscountsFromForm(
  enabled: Record<CpPriceCategory, boolean>,
  inputs: Record<CpPriceCategory, string>
): CpCategoryDiscounts {
  const parsed = discountsFromEnabled(enabled, inputs);
  if (parsed.ok) return parsed.discounts;
  const raw: Partial<CpCategoryDiscounts> = {};
  for (const c of CP_CATEGORIES) {
    if (!enabled[c]) {
      raw[c] = 0;
      continue;
    }
    const p = parseDiscountInput(inputs[c]);
    raw[c] = p.ok ? p.value : 0;
  }
  return normalizeCategoryDiscounts(raw);
}

function contactLine(parts: Array<string | null | undefined>): string | null {
  const text = parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");
  return text || null;
}

function RecipientBadge({ kind }: { kind: "client" | "lead" | "pending_lead" }) {
  if (kind === "pending_lead") {
    return (
      <span className="inline-flex shrink-0 rounded-full border border-[#7C4A57]/20 bg-[#F7EEF0] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#7C4A57]">
        Naujas leadas
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-full border border-[#E8E8EB] bg-[#F7F7F8] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#6F7077]">
      {kind === "lead" ? "LEADAS" : "KLIENTAS"}
    </span>
  );
}

function RecipientIdentity({
  name,
  contact,
  kind,
}: {
  name: string;
  contact: string | null;
  kind: "client" | "lead" | "pending_lead";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F7EEF0] text-[12px] font-semibold text-[#7C4A57]">
        {recipientInitials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-[#17171B]">{name}</span>
          <RecipientBadge kind={kind} />
        </div>
        {contact ? <p className="truncate text-[12px] text-[#6F7077]">{contact}</p> : null}
      </div>
    </div>
  );
}

function PendingLeadRecipient({ pending }: { pending: ExpressPendingLead }) {
  const contact = contactLine([
    pending.contactName,
    pending.email,
    pending.phone,
    pending.companyCode ? `Įmonės kodas ${pending.companyCode}` : null,
  ]);
  return (
    <div>
      <RecipientIdentity name={pending.companyName} contact={contact} kind="pending_lead" />
      <p className="mt-2 text-[12px] text-[#6F7077]">
        Šios organizacijos dar nėra CRM. Ruošiant pasiūlymą ji bus išsaugota kaip leadas.
      </p>
    </div>
  );
}

function MissingEmailNote() {
  return (
    <p className="mt-2 text-[12px] text-[#6F7077]">
      El. pašto nėra — jo prireiks vėliau, kai pasiūlymą reikės siųsti.
    </p>
  );
}

function ExpressRecipientRow({
  recipient,
  recipients,
  emptyMessage,
  onSelect,
  disabled,
}: {
  recipient: ProposalRecipientOption | null;
  recipients: ProposalRecipientOption[];
  emptyMessage?: string | null;
  onSelect: (row: ProposalRecipientOption) => void;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  if (!recipient && recipients.length === 0) {
    return (
      <p className="text-[13px] text-red-700">
        {emptyMessage ?? "Šiai kortelei nerastas susietas gavėjas. Pasiūlymo kurti negalima."}
      </p>
    );
  }
  if (!recipient) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-[#17171B]">Pasirinkite gavėją — rasti keli variantai.</p>
        <ul className="divide-y divide-[#E8E8EB] rounded-[10px] border border-[#E8E8EB]">
          {recipients.map((row) => (
            <li key={`${row.recipientType}-${row.recipientId}`}>
              <button
                type="button"
                disabled={disabled}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#F7F7F8] disabled:opacity-50 ${FOCUS_RING}`}
                onClick={() => onSelect(row)}
              >
                <RecipientIdentity
                  name={row.recipientName}
                  contact={contactLine([row.contactName, row.email, row.phone])}
                  kind={row.recipientType === "lead" ? "lead" : "client"}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <RecipientIdentity
            name={recipient.recipientName}
            contact={contactLine([recipient.contactName, recipient.email, recipient.phone])}
            kind={recipient.recipientType === "lead" ? "lead" : "client"}
          />
        </div>
        {recipients.length > 1 ? (
          <button
            type="button"
            disabled={disabled}
            className={`shrink-0 text-[13px] font-medium text-[#7C4A57] hover:underline disabled:opacity-50 ${FOCUS_RING}`}
            onClick={() => setPicking((v) => !v)}
          >
            Keisti
          </button>
        ) : null}
      </div>
      {picking ? (
        <ul className="mt-2 divide-y divide-[#E8E8EB] rounded-[10px] border border-[#E8E8EB]">
          {recipients.map((row) => (
            <li key={`${row.recipientType}-${row.recipientId}`}>
              <button
                type="button"
                disabled={disabled}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#F7F7F8] disabled:opacity-50 ${FOCUS_RING}`}
                onClick={() => {
                  onSelect(row);
                  setPicking(false);
                }}
              >
                <span className="truncate text-[13px] text-[#17171B]">{row.recipientName}</span>
                <span className="text-[10px] font-semibold uppercase text-[#6F7077]">
                  {row.recipientType === "lead" ? "LEADAS" : "KLIENTAS"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CompactGeneratedBody({
  proposalNumber,
  justDownloaded,
}: {
  proposalNumber: string | null;
  justDownloaded: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
        <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="currentColor" className="text-emerald-600" />
          <path d="M5 8.2 7 10.2 11.2 6" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p>
          PDF sugeneruotas.
          {justDownloaded ? " Atsisiuntimas pradėtas." : null}
        </p>
      </div>
      {proposalNumber ? (
        <p className="text-[22px] font-semibold tabular-nums tracking-tight text-[#17171B]">{proposalNumber}</p>
      ) : null}
    </div>
  );
}

function LoadingBody() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#E8E8EB] border-t-[#7C4A57]" />
        <span className="text-[13px] text-[#6F7077]">Kraunama…</span>
      </div>
      <div className="space-y-2">
        <div className="h-11 animate-pulse rounded-[10px] bg-[#F7F7F8]" />
        <div className="h-8 animate-pulse rounded-[10px] bg-[#F7F7F8]" />
        <div className="h-24 animate-pulse rounded-[10px] bg-[#F7F7F8]" />
      </div>
    </div>
  );
}

export function ExpressProposalModal({
  workItemId,
  projectId,
  returnToDrawer,
  onClose,
}: {
  workItemId: string;
  projectId: string;
  returnToDrawer: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [busyKind, setBusyKind] = useState<"studio" | "pdf" | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [context, setContext] = useState<ExpressProposalContext | null>(null);
  const [view, setView] = useState<View>("form");
  const [recipient, setRecipient] = useState<ProposalRecipientOption | null>(null);
  const [enabled, setEnabled] = useState<Record<CpPriceCategory, boolean>>({
    translation: false,
    ai_translation: false,
    additional_service: false,
  });
  const [inputs, setInputs] = useState<Record<CpPriceCategory, string>>({
    translation: "",
    ai_translation: "",
    additional_service: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CpPriceCategory, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ExpressProposalSummary | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const busy = pending || loading || busyKind !== null;
  const liveDiscounts = useMemo(() => liveDiscountsFromForm(enabled, inputs), [enabled, inputs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void getExpressProposalContextAction(workItemId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(res.error);
          setLoading(false);
          return;
        }
        setContext(res.context);
        setRecipient(res.context.selectedRecipient);
        if (res.context.proposal) {
          setProposal(res.context.proposal);
          const form = formFromDiscounts(res.context.proposal.discounts);
          setEnabled(form.enabled);
          setInputs(form.inputs);
          setGroupId(matchingGroupId(res.context.pricingGroups, res.context.proposal.discounts));
        } else {
          const def = defaultPricingGroup(res.context.pricingGroups);
          if (def) {
            setGroupId(def.id);
            const form = formFromDiscounts(def.discounts);
            setEnabled(form.enabled);
            setInputs(form.inputs);
          }
        }
        if (res.context.mode === "generated" && res.context.proposal) setView("generated");
        else setView("form");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Nepavyko įkelti pasiūlymo.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workItemId]);

  useEffect(() => {
    const unlock = lockStudioScroll();
    const dialog = dialogRef.current;
    const id = window.requestAnimationFrame(() => {
      if (!dialog) return;
      const nodes = getFocusable(dialog);
      const closeBtn = nodes.find((n) => n.getAttribute("aria-label") === "Uždaryti");
      const firstContent = nodes.find((n) => n.getAttribute("aria-label") !== "Uždaryti");
      (loading ? closeBtn ?? firstContent : firstContent ?? closeBtn)?.focus();
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (pending) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const nodes = getFocusable(dialog);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
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
    };
  }, [pending, loading, onClose]);

  function collectDiscounts() {
    const parsed = discountsFromEnabled(enabled, inputs);
    if (!parsed.ok) {
      setFieldErrors(parsed.fieldErrors);
      setError(null);
      return null;
    }
    setFieldErrors({});
    return parsed.discounts;
  }

  function prepare(then: (p: ExpressProposalSummary) => void) {
    if (!recipient && !context?.pendingLead) {
      setError(context?.recipients.length ? "Pasirinkite gavėją." : "Gavėjas nerastas.");
      return;
    }
    const discounts = collectDiscounts();
    if (!discounts) return;
    setError(null);
    setBusyKind("studio");
    start(async () => {
      try {
        const prepared = await prepareDraft(discounts);
        if (!prepared) return;
        then(prepared);
      } catch {
        setError("Nepavyko paruošti pasiūlymo.");
      } finally {
        setBusyKind(null);
      }
    });
  }

  async function prepareDraft(discounts: CpCategoryDiscounts): Promise<ExpressProposalSummary | null> {
    const res = await prepareExpressProposalAction({
      workItemId,
      recipientType: recipient?.recipientType,
      recipientId: recipient?.recipientId,
      categoryDiscounts: discounts,
    });
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    const refreshed = await getExpressProposalContextAction(workItemId);
    if (refreshed.ok) {
      setContext(refreshed.context);
      setRecipient(refreshed.context.selectedRecipient);
    }
    setProposal(res.proposal);
    return res.proposal;
  }

  function openStudio(id: string) {
    rememberKanbanExpressReturn(projectId, workItemId, returnToDrawer);
    const url = new URL(window.location.href);
    url.searchParams.set("wi", workItemId);
    window.history.replaceState(null, "", url.pathname + url.search);
    router.push(commercialProposalPath(id));
  }

  function generateAndDownload() {
    if (!recipient && !context?.pendingLead) {
      setError(context?.recipients.length ? "Pasirinkite gavėją." : "Gavėjas nerastas.");
      return;
    }
    const discounts = collectDiscounts();
    if (!discounts) return;
    setError(null);
    setBusyKind("pdf");
    start(async () => {
      try {
        const prepared = await prepareDraft(discounts);
        if (!prepared) return;
        const res = await generateCommercialProposalAction(prepared.id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const refreshed = await getExpressProposalContextAction(workItemId);
        if (refreshed.ok && refreshed.context.proposal) {
          setProposal(refreshed.context.proposal);
          setContext(refreshed.context);
        } else {
          setProposal({ ...prepared, status: "generated" });
        }
        try {
          triggerProposalPdfDownload(prepared.id);
        } catch {
          setError("Pasiūlymas sugeneruotas, bet atsisiųsti nepavyko.");
        }
        setView("success");
      } catch {
        setError("Nepavyko sugeneruoti pasiūlymo.");
      } finally {
        setBusyKind(null);
      }
    });
  }

  const title =
    view === "success" || view === "generated" ? "Pasiūlymas sugeneruotas" : "Greitas komercinis pasiūlymas";

  const showFooter = !loading && !loadError && (
    view === "form" ||
    ((view === "success" || view === "generated") && proposal)
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17171B]/40 p-4"
      onMouseDown={(e) => {
        if (pending) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="express-proposal-title"
        className={`flex max-h-[85vh] flex-col overflow-hidden rounded-[16px] border border-[#E8E8EB] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${
          view === "success" || view === "generated"
            ? "w-[min(520px,calc(100vw-32px))]"
            : "w-[min(720px,calc(100vw-32px))]"
        }`}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-[#E8E8EB] bg-white px-5 py-3">
          <h2 id="express-proposal-title" className="min-w-0 pt-0.5 text-[18px] font-semibold text-[#17171B]">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Uždaryti"
            disabled={pending}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[22px] leading-none text-[#6F7077] hover:bg-[#F7F7F8] hover:text-[#17171B] disabled:opacity-50 ${FOCUS_RING}`}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-3">
          {loading ? <LoadingBody /> : null}
          {loadError ? <p className="text-[13px] text-red-700">{loadError}</p> : null}

          {!loading && !loadError && view === "form" ? (
            <div className="space-y-4">
              <section>
                <h3 className="text-[12px] font-medium uppercase tracking-wide text-[#6F7077]">Gavėjas</h3>
                <div className="mt-2">
                  {context?.pendingLead && !recipient ? (
                    <PendingLeadRecipient pending={context.pendingLead} />
                  ) : (
                    <ExpressRecipientRow
                      recipient={recipient}
                      recipients={context?.recipients ?? []}
                      emptyMessage={context?.recipientError}
                      disabled={busy}
                      onSelect={setRecipient}
                    />
                  )}
                  {(!recipient?.email && !context?.pendingLead?.email && (recipient || context?.pendingLead)) ? (
                    <MissingEmailNote />
                  ) : null}
                </div>
              </section>
              <section>
                <PricingGroupPicker
                  compact
                  groups={context?.pricingGroups ?? []}
                  selectedId={groupId}
                  disabled={busy}
                  onSelect={(group) => {
                    setGroupId(group.id);
                    const form = formFromDiscounts(group.discounts);
                    setEnabled(form.enabled);
                    setInputs(form.inputs);
                    setFieldErrors({});
                  }}
                />
              </section>
              <section>
                <ExpressCategoryAccordion items={context?.catalog ?? []} discounts={liveDiscounts} />
              </section>
            </div>
          ) : null}

          {!loading && !loadError && (view === "success" || view === "generated") && proposal ? (
            <CompactGeneratedBody
              proposalNumber={proposal.proposalNumber}
              justDownloaded={view === "success"}
            />
          ) : null}

          {error ? <p className="mt-3 text-[13px] text-red-700">{error}</p> : null}
        </div>

        {showFooter ? (
          <footer className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#E8E8EB] bg-white px-5 py-3">
            {view === "form" ? (
              <>
                <button type="button" disabled={busy} className={BTN_GHOST} onClick={onClose}>
                  Atšaukti
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={BTN_SECONDARY}
                  onClick={() => prepare((p) => openStudio(p.id))}
                >
                  {busyKind === "studio" ? "Ruošiama…" : "Pilnas redagavimas"}
                </button>
                <button
                  type="button"
                  disabled={busy || (!recipient && !context?.pendingLead)}
                  className={BTN_PRIMARY}
                  onClick={generateAndDownload}
                >
                  {busyKind === "pdf" ? "Generuojama…" : "Generuoti ir atsisiųsti PDF"}
                </button>
              </>
            ) : null}

            {(view === "success" || view === "generated") && proposal ? (
              <>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => {
                    try {
                      triggerProposalPdfDownload(proposal.id);
                    } catch {
                      setError("Nepavyko atsisiųsti PDF.");
                    }
                  }}
                >
                  Atsisiųsti dar kartą
                </button>
                <button type="button" className={BTN_PRIMARY} onClick={() => openStudio(proposal.id)}>
                  Atidaryti pasiūlymą
                </button>
              </>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
