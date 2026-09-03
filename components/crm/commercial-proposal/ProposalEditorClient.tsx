"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Percent, X } from "lucide-react";
import { lockStudioScroll } from "@/components/crm/commercial-proposal/studio/lockStudioScroll";
import { ProposalStudioHeader } from "@/components/crm/commercial-proposal/studio/ProposalStudioHeader";
import {
  ProposalSummaryBar,
  ProposalWorkflowRail,
  StudioSection,
} from "@/components/crm/commercial-proposal/studio/ProposalWorkflowRail";
import { ProposalPdfPreviewPane } from "@/components/crm/commercial-proposal/studio/ProposalPdfPreviewPane";
import { ProposalPricingGroup } from "@/components/crm/commercial-proposal/studio/ProposalPricingGroup";
import { ProposalServiceCard } from "@/components/crm/commercial-proposal/studio/ProposalServiceCard";
import { ServicePickerModal } from "@/components/crm/commercial-proposal/studio/ServicePickerModal";
import { STUDIO_INNER_CLASS, STUDIO_ROOT_CLASS, STUDIO_WORKSPACE_CLASS } from "@/components/crm/commercial-proposal/studio/layoutClasses";
import { CATEGORY_LABEL, STUDIO_CARD, formatDiscountPct, recipientInitials } from "@/components/crm/commercial-proposal/studio/shared";
import { PricingGroupPicker } from "@/components/crm/commercial-proposal/PricingGroupPicker";
import type { EditorTab } from "@/components/crm/commercial-proposal/studio/types";
import {
  RecipientPickerDialog,
  SelectedRecipientControl,
  recipientCardHref,
  recipientCardLabel,
} from "@/components/crm/commercial-proposal/RecipientSelector";
import {
  duplicateCommercialProposalAction,
  generateCommercialProposalAction,
  getProposalRecipientOptionAction,
  markProposalSentAction,
  updateProposalLineInclusionAction,
  updateProposalRecipientAction,
  updateProposalSettingsAction,
  type ProposalEditorPayload,
  type ProposalRecipientOption,
} from "@/lib/crm/commercialProposalActions";
import { commercialProposalPath, CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";
import {
  categoryDiscount,
  clampDiscountPct,
  isLineIncluded,
  normalizeCategoryDiscounts,
  type CpCategoryDiscounts,
} from "@/lib/commercialProposal/discounts";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import { CP_CATEGORIES, type CommercialProposalLine, type CpPriceCategory } from "@/lib/commercialProposal/types";
import type { CpPricingGroup } from "@/lib/crm/pricingGroups";

function CategoryCheckbox({
  selected,
  total,
  disabled,
  onChange,
  ariaLabel,
}: {
  selected: number;
  total: number;
  disabled: boolean;
  onChange: (included: boolean) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="mt-2"
      checked={total > 0 && selected === total}
      disabled={disabled || total === 0}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel}
    />
  );
}

function formatSavedAgo(at: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - at) / 60000));
  if (mins < 1) return "Išsaugota";
  if (mins === 1) return "Išsaugota prieš 1 min.";
  return `Išsaugota prieš ${mins} min.`;
}

function DiscountEditor({
  discounts,
  discountInputs,
  applyAll,
  pending,
  pricingGroups,
  onApplyGroup,
  onApplyAllChange,
  onInputChange,
  onApplyAll,
  onBlurCategory,
  onClose,
}: {
  discounts: CpCategoryDiscounts;
  discountInputs: Record<CpPriceCategory, string>;
  applyAll: string;
  pending: boolean;
  pricingGroups: CpPricingGroup[];
  onApplyGroup: (group: CpPricingGroup) => void;
  onApplyAllChange: (v: string) => void;
  onInputChange: (category: CpPriceCategory, v: string) => void;
  onApplyAll: () => void;
  onBlurCategory: (category: CpPriceCategory) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const unlock = lockStudioScroll();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-editor-title"
        className="w-full max-w-md rounded-[16px] border border-[#E8E8EB] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="discount-editor-title" className="text-[16px] font-semibold text-[#17171B]">
              Nuolaidos
            </h2>
            <p className="mt-0.5 text-[13px] text-[#6F7077]">Kategorijos nuolaida taikoma visoms jos eilutėms.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6F7077] hover:bg-zinc-50"
            aria-label="Uždaryti"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <PricingGroupPicker
            groups={pricingGroups}
            selectedId={
              pricingGroups.find(
                (g) =>
                  g.discounts.translation === discounts.translation &&
                  g.discounts.ai_translation === discounts.ai_translation &&
                  g.discounts.additional_service === discounts.additional_service
              )?.id ?? null
            }
            disabled={pending}
            onSelect={onApplyGroup}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="text-[12px] font-medium text-[#6F7077]">Taikyti visoms kategorijoms</span>
            <input
              value={applyAll}
              disabled={pending}
              inputMode="decimal"
              onChange={(e) => onApplyAllChange(e.target.value)}
              className="mt-1 h-9 w-28 rounded-[10px] border border-[#E8E8EB] px-3 text-sm tabular-nums"
            />
          </label>
          <button
            type="button"
            disabled={pending || applyAll.trim() === ""}
            className="h-9 rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm font-medium text-[#17171B] hover:bg-zinc-50 disabled:opacity-50"
            onClick={onApplyAll}
          >
            Taikyti
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {CP_CATEGORIES.map((c) => (
            <label key={c} className="block text-sm">
              <span className="text-[12px] font-medium text-[#6F7077]">{CATEGORY_LABEL[c]}</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={discountInputs[c]}
                  disabled={pending}
                  inputMode="decimal"
                  onChange={(e) => onInputChange(c, e.target.value)}
                  onBlur={() => onBlurCategory(c)}
                  className="h-9 w-full rounded-[10px] border border-[#E8E8EB] px-3 text-sm tabular-nums"
                />
                <span className="text-sm text-[#6F7077]">%</span>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-[#989AA2]">Dabartinės: {discounts.translation}% / {discounts.ai_translation}% / {discounts.additional_service}%</p>
      </div>
    </div>
  );
}

export function ProposalEditorClient({
  initial,
}: {
  initial: ProposalEditorPayload;
}) {
  const router = useRouter();
  const [proposal] = useState(initial.proposal);
  const [lines, setLines] = useState(initial.lines);
  const initialDiscounts = normalizeCategoryDiscounts(initial.discounts ?? initial.proposal.discounts);
  const [discounts, setDiscounts] = useState<CpCategoryDiscounts>(initialDiscounts);
  const [discountInputs, setDiscountInputs] = useState<Record<CpPriceCategory, string>>({
    translation: String(initialDiscounts.translation),
    ai_translation: String(initialDiscounts.ai_translation),
    additional_service: String(initialDiscounts.additional_service),
  });
  const [applyAll, setApplyAll] = useState("");
  const [recipient, setRecipient] = useState<ProposalRecipientOption>(() => ({
    recipientType: initial.proposal.recipient_type === "lead" ? "lead" : "client",
    recipientId: initial.proposal.recipient_id ?? "",
    recipientName: initial.proposal.recipient_name || initial.proposal.client_name,
    contactName: initial.proposal.contact_name,
    email: initial.proposal.recipient_email,
    phone: initial.proposal.recipient_phone,
    companyCode: initial.proposal.company_code,
    clientKey: initial.proposal.client_key,
    clientId: initial.proposal.client_id,
  }));
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [managerEditing, setManagerEditing] = useState(false);
  const [managerId, setManagerId] = useState(initial.proposal.sales_manager_id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<EditorTab>("recipient");
  const [pickerCategory, setPickerCategory] = useState<CpPriceCategory | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [pdfDrawerOpen, setPdfDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openPriceCats, setOpenPriceCats] = useState<Record<CpPriceCategory, boolean>>({
    translation: true,
    ai_translation: false,
    additional_service: false,
  });
  const [fullPriceCats, setFullPriceCats] = useState<Record<CpPriceCategory, boolean>>({
    translation: false,
    ai_translation: false,
    additional_service: false,
  });
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfRefreshing, setPdfRefreshing] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const pickerReturnFocus = useRef<HTMLElement | null>(null);
  const recipientControlRef = useRef<HTMLButtonElement>(null);
  const managerSelectRef = useRef<HTMLSelectElement>(null);
  const managerEditBtnRef = useRef<HTMLButtonElement>(null);
  const firstPreview = useRef(true);
  const hasPdfBytes = useRef(false);
  const readOnly = proposal.status !== "draft";

  const grouped = useMemo(() => {
    return CP_CATEGORIES.map((c) => ({
      category: c,
      rows: lines.filter((l) => l.category === c).sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [lines]);

  const manager = initial.managers.find((m) => m.id === managerId) ?? initial.managers[0];
  const includedCount = lines.filter(isLineIncluded).length;
  const includedCategories = grouped.filter((g) => g.rows.some(isLineIncluded)).length;
  const manualOverrideCount = lines.filter((l) => isLineIncluded(l) && l.is_manual_override).length;
  const cardHref = recipientCardHref(recipient);

  const previewSig = useMemo(
    () =>
      JSON.stringify({
        id: proposal.id,
        status: proposal.status,
        recipient: recipient.recipientName,
        recipientId: recipient.recipientId,
        recipientType: recipient.recipientType,
        managerId,
        discounts,
        lines: lines.map((l) => [l.id, isLineIncluded(l), l.final_price, l.is_manual_override]),
      }),
    [proposal.id, proposal.status, recipient, managerId, discounts, lines]
  );

  useEffect(() => {
    const i = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(i);
  }, []);

  useEffect(() => {
    editorScrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  useEffect(() => {
    if (!managerEditing) return;
    const focusId = window.requestAnimationFrame(() => managerSelectRef.current?.focus());
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (recipientPickerOpen || pickerCategory || discountOpen) return;
      e.preventDefault();
      setManagerEditing(false);
      window.requestAnimationFrame(() => managerEditBtnRef.current?.focus());
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(focusId);
      document.removeEventListener("keydown", onKey);
    };
  }, [managerEditing, recipientPickerOpen, pickerCategory, discountOpen]);

  useEffect(() => {
    if (recipient.recipientType !== "lead" || recipient.projectId || !recipient.recipientId) return;
    let cancelled = false;
    void getProposalRecipientOptionAction({
      recipientType: "lead",
      recipientId: recipient.recipientId,
    }).then((opt) => {
      if (cancelled || !opt) return;
      setRecipient((prev) => ({ ...prev, projectId: opt.projectId, projectName: opt.projectName }));
    });
    return () => {
      cancelled = true;
    };
  }, [recipient.recipientType, recipient.recipientId, recipient.projectId]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = () => {
      if (mq.matches) setPdfDrawerOpen(false);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!menuOpen && !previewOpen && !pdfDrawerOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuOpen && headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pickerCategory || discountOpen || recipientPickerOpen) return;
      setMenuOpen(false);
      setPreviewOpen(false);
      setPdfDrawerOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, previewOpen, pdfDrawerOpen, pickerCategory, discountOpen, recipientPickerOpen]);

  useEffect(() => {
    const ac = new AbortController();
    const delay = firstPreview.current ? 0 : 700;
    firstPreview.current = false;
    const t = window.setTimeout(() => {
      if (hasPdfBytes.current) setPdfRefreshing(true);
      else setPdfLoading(true);
      const url =
        proposal.status === "draft"
          ? `/api/crm/commercial-proposals/${proposal.id}/preview`
          : `/api/crm/commercial-proposals/${proposal.id}/pdf?fresh=1`;
      void fetch(url, { signal: ac.signal, cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error || "Nepavyko paruošti peržiūros.");
          }
          return res.arrayBuffer();
        })
        .then((buf) => {
          setPdfBytes(new Uint8Array(buf));
          hasPdfBytes.current = true;
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
        })
        .finally(() => {
          setPdfLoading(false);
          setPdfRefreshing(false);
        });
    }, delay);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [previewSig, proposal.id, proposal.status]);

  function markSaved() {
    setSaveError(false);
    setLastSavedAt(Date.now());
    setNowTick(Date.now());
  }

  function reportSaveError(error: string) {
    setSaveError(true);
    setMessage(error);
  }

  function applyDiscountsLocally(next: CpCategoryDiscounts) {
    setDiscounts(next);
    setDiscountInputs({
      translation: String(next.translation),
      ai_translation: String(next.ai_translation),
      additional_service: String(next.additional_service),
    });
    setLines((prev) =>
      prev.map((line) => {
        if (line.is_free || line.base_price == null) return line;
        const calculated = applyGlobalDiscount(line.base_price, categoryDiscount(next, line.category));
        return {
          ...line,
          calculated_price: calculated,
          final_price: line.is_manual_override ? line.final_price : calculated,
        };
      })
    );
  }

  function saveSettings(nextDiscounts?: CpCategoryDiscounts) {
    return updateProposalSettingsAction({
      proposalId: proposal.id,
      salesManagerId: managerId,
      categoryDiscounts: nextDiscounts,
    });
  }

  function setLinesIncluded(nextIds: string[], included: boolean) {
    const idSet = new Set(nextIds);
    let rollback: CommercialProposalLine[] | null = null;
    setLines((prev) => {
      rollback = prev;
      return prev.map((line) => (idSet.has(line.id) ? { ...line, included } : line));
    });
    start(async () => {
      const res = await updateProposalLineInclusionAction({
        proposalId: proposal.id,
        lineIds: nextIds,
        included,
      });
      if (!res.ok) {
        if (rollback) setLines(rollback);
        reportSaveError(res.error);
      } else {
        markSaved();
      }
    });
  }

  function openPreview() {
    setPreviewKey((k) => k + 1);
    setPreviewOpen(true);
  }

  function generatePdf() {
    setMessage(null);
    start(async () => {
      const next = normalizeCategoryDiscounts({
        translation: discountInputs.translation.replace(",", "."),
        ai_translation: discountInputs.ai_translation.replace(",", "."),
        additional_service: discountInputs.additional_service.replace(",", "."),
      });
      setDiscounts(next);
      const settings = await saveSettings(next);
      if (!settings.ok) {
        reportSaveError(settings.error);
        return;
      }
      const res = await generateCommercialProposalAction(proposal.id);
      if (!res.ok) {
        reportSaveError(res.error);
        return;
      }
      window.location.reload();
    });
  }

  function saveDiscountCategory(category: CpPriceCategory) {
    const next = normalizeCategoryDiscounts({
      ...discounts,
      [category]: discountInputs[category].replace(",", "."),
    });
    applyDiscountsLocally(next);
    start(async () => {
      const res = await saveSettings(next);
      if (!res.ok) reportSaveError(res.error);
      else markSaved();
    });
  }

  function openPicker(category: CpPriceCategory) {
    pickerReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPickerCategory(category);
  }

  const translationLabel = formatDiscountPct(categoryDiscount(discounts, "translation"));
  const aiLabel = formatDiscountPct(categoryDiscount(discounts, "ai_translation"));
  const extraLabel = formatDiscountPct(categoryDiscount(discounts, "additional_service"));
  const canReassignManager =
    !readOnly && initial.canChangeManager && initial.managers.length > 1;
  const summaries: Record<EditorTab, string> = {
    recipient: recipient.recipientName || "—",
    services: includedCategories > 0 ? `${includedCategories} kategorijos` : "Neįtraukta",
    prices: [translationLabel && `Vertimas ${translationLabel}`, aiLabel && `AI ${aiLabel}`, extraLabel && `Papildomos ${extraLabel}`]
      .filter((v): v is string => Boolean(v))
      .join(" · ") || "Be nuolaidų",
    review: proposal.status === "draft" ? "Paruošimui" : "Sugeneruotas",
  };
  const completed: Record<EditorTab, boolean> = {
    recipient: Boolean(recipient.recipientName.trim()),
    services: includedCount > 0,
    prices: includedCount > 0,
    review: proposal.status !== "draft",
  };

  const pdfPane = (
    <ProposalPdfPreviewPane
      pdfBytes={pdfBytes}
      loading={pdfLoading}
      refreshing={pdfRefreshing}
      onFullscreen={openPreview}
    />
  );

  function openRecipientPicker(from?: HTMLElement | null) {
    pickerReturnFocus.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setTab("recipient");
    setRecipientPickerOpen(true);
  }

  return (
    <div data-proposal-studio="studio" className={STUDIO_ROOT_CLASS}>
      <div className={STUDIO_INNER_CLASS}>
      <div ref={headerRef} className="shrink-0">
        <ProposalStudioHeader
          proposalNumber={proposal.proposal_number}
          status={proposal.status}
          recipientName={recipient.recipientName}
          saving={pending}
          saveError={saveError}
          savedLabel={lastSavedAt == null ? null : formatSavedAgo(lastSavedAt, nowTick)}
          includedCount={includedCount}
          pending={pending}
          canDelete={initial.canDelete}
          readOnly={readOnly}
          proposalId={proposal.id}
          menuOpen={menuOpen}
          onMenuOpenChange={setMenuOpen}
          onPreview={openPreview}
          onDuplicate={() => {
            setMenuOpen(false);
            start(async () => {
              const res = await duplicateCommercialProposalAction(proposal.id);
              if (res.ok) router.push(commercialProposalPath(res.id));
              else setMessage(res.error);
            });
          }}
          onDeleted={() => router.push(`${CP_TOOL_PATH}?deleted=1`)}
          onMarkSent={() => {
            start(async () => {
              const res = await markProposalSentAction(proposal.id);
              if (!res.ok) setMessage(res.error);
              else window.location.reload();
            });
          }}
          onEditRecipient={() => openRecipientPicker()}
          showEditRecipient={!readOnly && tab !== "recipient"}
        />
      </div>

      {message ? <p className="shrink-0 px-1 py-2 text-sm text-red-600">{message}</p> : null}
      {readOnly ? (
        <p className="mx-1 mb-2 shrink-0 rounded-[12px] border border-[#E8E8EB] bg-white px-3 py-2 text-sm text-[#6F7077]">
          Šis pasiūlymas užšaldytas — redagavimas išjungtas. Galite peržiūrėti ir atsisiųsti PDF.
        </p>
      ) : null}

      <div data-studio-workspace="workspace" className={STUDIO_WORKSPACE_CLASS}>
        <div className="min-h-0 shrink-0 overflow-x-auto xl:overflow-visible">
          <ProposalWorkflowRail tab={tab} onTab={setTab} summaries={summaries} completed={completed} />
          <button
            type="button"
            className="mt-3 w-full rounded-[10px] border border-[#E8E8EB] bg-white px-3 py-2 text-sm font-medium text-[#17171B] xl:hidden"
            onClick={() => setPdfDrawerOpen(true)}
          >
            Pasiūlymo peržiūra
          </button>
        </div>

        <div ref={editorScrollRef} data-studio-editor-scroll="scroll" className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pb-4 pr-1">
          {tab === "recipient" ? (
            <StudioSection title="Gavėjas" subtitle="Kas gaus pasiūlymą ir kas jį ruošia.">
              <section className={`${STUDIO_CARD} w-full min-w-0 p-5`}>
                <SelectedRecipientControl
                  recipient={recipient}
                  disabled={readOnly || pending}
                  buttonRef={recipientControlRef}
                  expanded={recipientPickerOpen}
                  size="studio"
                  onClick={readOnly ? undefined : () => openRecipientPicker(recipientControlRef.current)}
                />
                <p className="mt-2.5 truncate text-[12px] text-[#5C5D64]">
                  {cardHref ? (
                    <a href={cardHref} className="hover:text-[#7C4A57] hover:underline">
                      {recipientCardLabel(recipient.recipientType)}
                    </a>
                  ) : null}
                </p>
                <div className="mt-3.5 border-t border-[#E8E8EB] pt-3.5">
                  <div data-gavejas-row="row">
                    <span
                      aria-hidden
                      data-gavejas-avatar="avatar"
                      className="bg-[#F4F4F5] text-[#5C5D64]"
                    >
                      {recipientInitials(manager?.name || "")}
                    </span>
                    {managerEditing && canReassignManager ? (
                      <div data-gavejas-identity="identity">
                        <select
                          ref={managerSelectRef}
                          value={managerId}
                          disabled={pending}
                          aria-label="Rengėjas"
                          title={manager ? `${manager.name} · ${manager.job_title}` : undefined}
                          onChange={(e) => {
                            const id = e.target.value;
                            setManagerId(id);
                            start(async () => {
                              const res = await updateProposalSettingsAction({
                                proposalId: proposal.id,
                                salesManagerId: id,
                              });
                              if (!res.ok) reportSaveError(res.error);
                              else markSaved();
                            });
                            setManagerEditing(false);
                            window.requestAnimationFrame(() => managerEditBtnRef.current?.focus());
                          }}
                          className="h-9 min-w-0 flex-1 truncate rounded-[10px] border border-[#E8E8EB] bg-[#FBFBFB] px-3 text-sm"
                        >
                          {initial.managers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {m.job_title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div data-gavejas-identity="identity">
                        <span
                          data-gavejas-name="name"
                          className="text-[13px] font-medium text-[#17171B]"
                          title={manager?.name || undefined}
                        >
                          {manager?.name || "—"}
                        </span>
                        <span
                          data-gavejas-badge="badge"
                          className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-[#E8E8EB] bg-[#F4F4F5] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#6F7077]"
                        >
                          Rengėjas
                        </span>
                      </div>
                    )}
                    <div data-gavejas-action="action">
                      {managerEditing && canReassignManager ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 w-full items-center justify-end whitespace-nowrap border-0 bg-transparent p-0 text-[13px] font-medium text-[#5C5D64] hover:underline"
                          onClick={() => {
                            setManagerEditing(false);
                            window.requestAnimationFrame(() => managerEditBtnRef.current?.focus());
                          }}
                        >
                          Atšaukti
                        </button>
                      ) : canReassignManager ? (
                        <button
                          ref={managerEditBtnRef}
                          type="button"
                          className="inline-flex min-h-11 w-full items-center justify-end whitespace-nowrap border-0 bg-transparent p-0 text-[13px] font-medium text-[#7C4A57] hover:underline"
                          onClick={() => setManagerEditing(true)}
                        >
                          Keisti
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            </StudioSection>
          ) : null}

          {tab === "services" ? (
            <StudioSection
              title="Paslaugos"
              subtitle="Pasirinkite, kurios kategorijos ir eilutės pateks į PDF."
              action={
                !readOnly ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm font-medium text-[#17171B] hover:bg-zinc-50"
                    onClick={() => setDiscountOpen(true)}
                  >
                    <Percent className="h-3.5 w-3.5" />
                    Redaguoti nuolaidas
                  </button>
                ) : null
              }
            >
              <div className="grid gap-3">
                {grouped.map((g) => {
                  const selected = g.rows.filter(isLineIncluded).length;
                  return (
                    <ProposalServiceCard
                      key={g.category}
                      category={g.category}
                      selected={selected}
                      total={g.rows.length}
                      discountPct={categoryDiscount(discounts, g.category)}
                      readOnly={readOnly}
                      checkbox={
                        readOnly ? (
                          <span className="w-4" />
                        ) : (
                        <CategoryCheckbox
                          selected={selected}
                          total={g.rows.length}
                          disabled={pending}
                          ariaLabel={`${CATEGORY_LABEL[g.category]} įtraukti`}
                          onChange={(included) => setLinesIncluded(g.rows.map((r) => r.id), included)}
                        />
                        )
                      }
                      onManage={() => openPicker(g.category)}
                    />
                  );
                })}
              </div>
              <p className="mt-3 text-[12px] text-[#989AA2]">
                Formulė: galutinė kaina = bazinė × (1 − kategorijos nuolaida / 100). Rankinis pakeitimas galioja tik
                šiam pasiūlymui.
              </p>
            </StudioSection>
          ) : null}

          {tab === "prices" ? (
            <StudioSection
              title="Kainodara"
              subtitle="Peržiūrėkite, koreguokite nuolaidas ir kainas pagal poreikį."
              action={
                !readOnly ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm font-medium text-[#17171B] hover:bg-zinc-50"
                    onClick={() => setDiscountOpen(true)}
                  >
                    <Percent className="h-3.5 w-3.5" />
                    Redaguoti nuolaidas
                  </button>
                ) : null
              }
            >
              <div className="space-y-3">
                {grouped.map((g) => (
                  <ProposalPricingGroup
                    key={g.category}
                    category={g.category}
                    rows={g.rows}
                    discounts={discounts}
                    readOnly={readOnly}
                    open={openPriceCats[g.category]}
                    full={fullPriceCats[g.category]}
                    onToggleOpen={() =>
                      setOpenPriceCats((prev) => ({ ...prev, [g.category]: !prev[g.category] }))
                    }
                    onToggleFull={() => {
                      setFullPriceCats((prev) => ({ ...prev, [g.category]: !prev[g.category] }));
                      setOpenPriceCats((prev) => ({ ...prev, [g.category]: true }));
                    }}
                    onManage={() => openPicker(g.category)}
                    onSaved={(next) => {
                      setLines((prev) => prev.map((x) => (x.id === next.id ? next : x)));
                      markSaved();
                    }}
                    onToggleIncluded={(id, included) => setLinesIncluded([id], included)}
                  />
                ))}
              </div>
            </StudioSection>
          ) : null}

          {tab === "review" ? (
            <StudioSection title="Peržiūra" subtitle="Patikrinkite santrauką prieš generuojant PDF." maxWidth="max-w-[720px]">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`${STUDIO_CARD} px-4 py-3.5`}>
                  <h3 className="text-[12px] font-medium uppercase tracking-wide text-[#6F7077]">Gavėjas</h3>
                  <p className="mt-1.5 text-[15px] font-semibold text-[#17171B]">{recipient.recipientName || "—"}</p>
                  <p className="mt-0.5 text-[12px] text-[#6F7077]">
                    {recipient.recipientType === "lead" ? "Leadas" : "Klientas"}
                  </p>
                </div>
                <div className={`${STUDIO_CARD} px-4 py-3.5`}>
                  <h3 className="text-[12px] font-medium uppercase tracking-wide text-[#6F7077]">Vadybininkas</h3>
                  <p className="mt-1.5 text-[15px] font-semibold text-[#17171B]">{manager?.name || "—"}</p>
                  <p className="mt-0.5 text-[12px] text-[#6F7077]">{manager?.job_title || ""}</p>
                </div>
                <div className={`${STUDIO_CARD} px-4 py-3.5`}>
                  <h3 className="text-[12px] font-medium uppercase tracking-wide text-[#6F7077]">Paslaugos</h3>
                  <ul className="mt-1.5 space-y-1 text-[13px]">
                    {grouped.map((g) => {
                      const n = g.rows.filter(isLineIncluded).length;
                      return (
                        <li key={g.category} className="flex justify-between gap-3">
                          <span className="text-[#6F7077]">{CATEGORY_LABEL[g.category]}</span>
                          <span className={n === 0 ? "text-[#989AA2]" : "font-medium text-[#17171B]"}>
                            {n === 0 ? "neįtraukta" : n}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className={`${STUDIO_CARD} px-4 py-3.5`}>
                  <h3 className="text-[12px] font-medium uppercase tracking-wide text-[#6F7077]">Kainodara</h3>
                  <ul className="mt-1.5 space-y-1 text-[13px] tabular-nums">
                    <li className="flex justify-between gap-3">
                      <span className="text-[#6F7077]">Vertimas</span>
                      <span className={translationLabel ? "text-[#7C4A57]" : "text-[#989AA2]"}>
                        {translationLabel ?? "—"}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-[#6F7077]">AI</span>
                      <span className={aiLabel ? "text-[#7C4A57]" : "text-[#989AA2]"}>{aiLabel ?? "—"}</span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-[#6F7077]">Papildomos</span>
                      <span className={extraLabel ? "text-[#7C4A57]" : "text-[#989AA2]"}>{extraLabel ?? "—"}</span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-[#6F7077]">Rankinės kainos</span>
                      <span className="font-medium text-[#17171B]">{manualOverrideCount}</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  disabled={includedCount === 0}
                  className="inline-flex h-9 items-center rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm font-medium text-[#17171B] hover:bg-zinc-50 disabled:opacity-50"
                  onClick={openPreview}
                >
                  Peržiūrėti PDF
                </button>
              </div>
            </StudioSection>
          ) : null}
        </div>

        <div className="hidden h-full min-h-0 min-w-0 overflow-hidden xl:block">
          {pdfPane}
        </div>
      </div>

      <ProposalSummaryBar
        includedCategories={includedCategories}
        includedCount={includedCount}
        manualCount={manualOverrideCount}
        translationPct={categoryDiscount(discounts, "translation")}
        aiPct={categoryDiscount(discounts, "ai_translation")}
        extraPct={categoryDiscount(discounts, "additional_service")}
        onGenerate={generatePdf}
        readOnly={readOnly}
        pending={pending}
      />
      </div>

      {recipientPickerOpen && !readOnly ? (
        <RecipientPickerDialog
          current={recipient}
          returnFocusTo={pickerReturnFocus.current}
          onClose={() => setRecipientPickerOpen(false)}
          onPicked={(row) => {
            start(async () => {
              const res = await updateProposalRecipientAction({
                proposalId: proposal.id,
                recipientType: row.recipientType,
                recipientId: row.recipientId,
              });
              if (!res.ok) {
                reportSaveError(res.error);
                return;
              }
              setRecipient({
                recipientType: res.recipient.recipientType,
                recipientId: res.recipient.recipientId,
                recipientName: res.recipient.recipientName,
                contactName: res.recipient.contactName,
                email: res.recipient.recipientEmail,
                phone: res.recipient.recipientPhone,
                companyCode: res.recipient.companyCode,
                clientKey: res.recipient.clientKey,
                clientId: res.recipient.clientId,
                projectId: res.recipient.projectId,
              });
              setRecipientPickerOpen(false);
              markSaved();
            });
          }}
        />
      ) : null}

      {pickerCategory ? (
        <ServicePickerModal
          category={pickerCategory}
          rows={grouped.find((g) => g.category === pickerCategory)?.rows ?? []}
          readOnly={readOnly}
          pending={pending}
          onClose={() => setPickerCategory(null)}
          returnFocusTo={pickerReturnFocus.current}
          onSetIncluded={setLinesIncluded}
        />
      ) : null}

      {discountOpen && !readOnly ? (
        <DiscountEditor
          discounts={discounts}
          discountInputs={discountInputs}
          applyAll={applyAll}
          pending={pending}
          pricingGroups={initial.pricingGroups ?? []}
          onApplyGroup={(group) => {
            applyDiscountsLocally(group.discounts);
            start(async () => {
              const res = await saveSettings(group.discounts);
              if (!res.ok) reportSaveError(res.error);
              else markSaved();
            });
          }}
          onApplyAllChange={setApplyAll}
          onInputChange={(category, v) => setDiscountInputs((prev) => ({ ...prev, [category]: v }))}
          onApplyAll={() => {
            const pct = clampDiscountPct(applyAll.replace(",", "."));
            const next = normalizeCategoryDiscounts({
              translation: pct,
              ai_translation: pct,
              additional_service: pct,
            });
            applyDiscountsLocally(next);
            setApplyAll(String(pct));
            start(async () => {
              const res = await saveSettings(next);
              if (!res.ok) reportSaveError(res.error);
              else markSaved();
            });
          }}
          onBlurCategory={saveDiscountCategory}
          onClose={() => setDiscountOpen(false)}
        />
      ) : null}

      {pdfDrawerOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Uždaryti peržiūrą"
            onClick={() => setPdfDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-[#F7F7F8] p-3 shadow-[-8px_0_24px_rgba(0,0,0,0.06)]">
            <div className="mb-2 flex justify-end">
              <button type="button" className="text-sm text-[#6F7077] hover:underline" onClick={() => setPdfDrawerOpen(false)}>
                Uždaryti
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{pdfPane}</div>
          </div>
        </div>
      ) : null}

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[16px] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E8E8EB] px-4 py-3">
              <div className="text-sm font-medium text-[#17171B]">PDF peržiūra</div>
              <button type="button" className="text-sm text-[#6F7077] hover:underline" onClick={() => setPreviewOpen(false)}>
                Uždaryti
              </button>
            </div>
            <iframe
              title="Proposal preview"
              className="min-h-0 flex-1"
              src={
                proposal.status === "draft"
                  ? `/api/crm/commercial-proposals/${proposal.id}/preview?t=${previewKey}`
                  : `/api/crm/commercial-proposals/${proposal.id}/pdf`
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
