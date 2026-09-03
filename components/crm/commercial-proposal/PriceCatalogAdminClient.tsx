"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { CategoryIcon } from "@/components/crm/commercial-proposal/studio/ProposalServiceCard";
import { CATEGORY_LABEL, STUDIO_CARD, ltPlural, matchesQuery } from "@/components/crm/commercial-proposal/studio/shared";
import { updatePriceItemAction } from "@/lib/crm/commercialProposalActions";
import { formatLtMoney, parseMoneyInput } from "@/lib/commercialProposal/money";
import { CP_CATEGORIES, type CpPriceCategory, type CpPriceItem } from "@/lib/commercialProposal/types";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#7C4A57] focus-visible:ring-offset-2";

type PriceKind = "fixed" | "from" | "free";

type RowDraft = {
  label: string;
  price: string;
  kind: PriceKind;
  unit: string;
  active: boolean;
};

const KIND_LABEL: Record<PriceKind, string> = {
  fixed: "Fiksuota",
  from: "Nuo",
  free: "Nemokama",
};

function kindFromItem(item: CpPriceItem): PriceKind {
  if (item.is_free) return "free";
  if (item.is_from_price) return "from";
  return "fixed";
}

function draftFromItem(item: CpPriceItem): RowDraft {
  return {
    label: item.label,
    price: item.base_price == null ? "" : formatLtMoney(item.base_price),
    kind: kindFromItem(item),
    unit: item.unit ?? "",
    active: item.active,
  };
}

function draftsDiffer(a: RowDraft, b: RowDraft): boolean {
  return a.label !== b.label || a.price !== b.price || a.kind !== b.kind || a.unit !== b.unit || a.active !== b.active;
}

function priceLabel(draft: RowDraft): string {
  if (draft.kind === "free") return "nemokamas";
  if (!draft.price.trim()) return "—";
  const amount = `${draft.price} €`;
  const unit = draft.unit.trim();
  const withUnit = unit ? `${amount} / ${unit}` : amount;
  return draft.kind === "from" ? `nuo ${withUnit}` : withUnit;
}

function categoryStats(items: CpPriceItem[]) {
  const active = items.filter((item) => item.active);
  const priced = active.filter((item) => !item.is_free && item.base_price != null);
  let min: number | null = null;
  let anyFrom = false;
  const unique = new Set<number>();
  for (const item of priced) {
    const base = item.base_price!;
    unique.add(base);
    if (min == null || base < min) min = base;
    if (item.is_from_price) anyFrom = true;
  }
  const from = anyFrom || unique.size > 1;
  return {
    total: items.length,
    active: active.length,
    minLabel:
      min == null
        ? null
        : from
          ? `nuo ${formatLtMoney(min)} €`
          : `${formatLtMoney(min)} €`,
  };
}

function KindPills({
  value,
  disabled,
  onChange,
}: {
  value: PriceKind;
  disabled?: boolean;
  onChange: (kind: PriceKind) => void;
}) {
  return (
    <div className="inline-flex rounded-[10px] border border-[#E8E8EB] bg-[#F7F7F8] p-0.5">
      {(["fixed", "from", "free"] as const).map((kind) => {
        const on = value === kind;
        return (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            className={[
              "h-8 rounded-[8px] px-2.5 text-[12px] font-medium disabled:opacity-50",
              on ? "bg-white text-[#17171B] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6F7077] hover:text-[#17171B]",
              FOCUS_RING,
            ].join(" ")}
            onClick={() => onChange(kind)}
          >
            {KIND_LABEL[kind]}
          </button>
        );
      })}
    </div>
  );
}

function CatalogRowEditor({
  draft,
  pending,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: RowDraft;
  pending: boolean;
  error: string | null;
  onChange: (next: Partial<RowDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const free = draft.kind === "free";
  return (
    <div className="space-y-3 rounded-[12px] bg-[#F7F7F8] p-3">
      <label className="block">
        <span className="text-[12px] font-medium text-[#6F7077]">Pavadinimas</span>
        <input
          value={draft.label}
          disabled={pending}
          onChange={(e) => onChange({ label: e.target.value })}
          className={`mt-1 h-9 w-full rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-[13px] text-[#17171B] ${FOCUS_RING}`}
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[12px] font-medium text-[#6F7077]">Kaina</span>
          <div className="relative mt-1">
            <input
              value={free ? "" : draft.price}
              disabled={pending || free}
              inputMode="decimal"
              placeholder={free ? "—" : "0,00"}
              onChange={(e) => onChange({ price: e.target.value })}
              className={`h-9 w-[7.5rem] rounded-[10px] border border-[#E8E8EB] bg-white px-3 pr-8 text-right text-[13px] tabular-nums text-[#17171B] disabled:bg-[#F7F7F8] disabled:text-[#A1A1A6] ${FOCUS_RING}`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[12px] text-[#6F7077]">
              €
            </span>
          </div>
        </label>
        <label className="block min-w-0 flex-1">
          <span className="text-[12px] font-medium text-[#6F7077]">Vnt.</span>
          <input
            value={draft.unit}
            disabled={pending}
            placeholder="nebūtina"
            onChange={(e) => onChange({ unit: e.target.value })}
            className={`mt-1 h-9 w-full min-w-[7rem] rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-[13px] text-[#17171B] ${FOCUS_RING}`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <KindPills value={draft.kind} disabled={pending} onChange={(kind) => onChange({ kind })} />
        <button
          type="button"
          role="switch"
          aria-checked={draft.active}
          disabled={pending}
          className={`inline-flex items-center gap-2 text-[13px] font-medium ${FOCUS_RING} rounded-[8px]`}
          onClick={() => onChange({ active: !draft.active })}
        >
          <span className={["relative h-5 w-9 rounded-full transition-colors", draft.active ? "bg-[#7C4A57]" : "bg-[#D9D9DE]"].join(" ")}>
            <span
              className={[
                "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                draft.active ? "translate-x-4" : "",
              ].join(" ")}
            />
          </span>
          {draft.active ? "Aktyvi" : "Neaktyvi"}
        </button>
      </div>
      {error ? <p className="text-[13px] text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={pending} className={`h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:underline ${FOCUS_RING}`} onClick={onCancel}>
          Atšaukti
        </button>
        <button
          type="button"
          disabled={pending}
          className={`h-9 rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50 ${FOCUS_RING}`}
          onClick={onSave}
        >
          {pending ? "Saugoma…" : "Išsaugoti"}
        </button>
      </div>
    </div>
  );
}

export function PriceCatalogAdminClient({ initial }: { initial: CpPriceItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [openCategory, setOpenCategory] = useState<CpPriceCategory | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RowDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const grouped = useMemo(
    () =>
      CP_CATEGORIES.map((category) => ({
        category,
        rows: items.filter((item) => item.category === category).sort((a, b) => a.sort_order - b.sort_order),
      })),
    [items]
  );

  const openGroup = grouped.find((g) => g.category === openCategory) ?? null;
  const visibleRows = useMemo(() => {
    if (!openGroup) return [];
    return openGroup.rows.filter((row) => matchesQuery(row.label, query));
  }, [openGroup, query]);

  function beginEdit(item: CpPriceItem) {
    setError(null);
    setEditingId(item.id);
    setEditDraft(draftFromItem(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setError(null);
  }

  function saveEdit(item: CpPriceItem) {
    if (!editDraft) return;
    setError(null);
    start(async () => {
      const res = await updatePriceItemAction({
        id: item.id,
        label: editDraft.label,
        basePrice: editDraft.price,
        isFromPrice: editDraft.kind === "from",
        isFree: editDraft.kind === "free",
        active: editDraft.active,
        sortOrder: item.sort_order,
        unit: editDraft.unit.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                label: editDraft.label.trim() || row.label,
                base_price: editDraft.kind === "free" ? null : parseMoneyInput(editDraft.price),
                is_from_price: editDraft.kind === "from",
                is_free: editDraft.kind === "free",
                unit: editDraft.unit.trim() || null,
                active: editDraft.active,
              }
            : row
        )
      );
      cancelEdit();
      router.refresh();
    });
  }

  if (openGroup) {
    const stats = categoryStats(openGroup.rows);
    return (
      <div className="max-w-[840px]">
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 text-[13px] font-medium text-[#7C4A57] hover:underline ${FOCUS_RING} rounded-[8px]`}
          onClick={() => {
            cancelEdit();
            setQuery("");
            setOpenCategory(null);
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Kainynas
        </button>

        <div className="mt-4 mb-4 flex items-start gap-3">
          <CategoryIcon category={openGroup.category} />
          <div>
            <h2 className="text-[22px] font-semibold tracking-tight text-[#17171B]">{CATEGORY_LABEL[openGroup.category]}</h2>
            <p className="mt-1 text-[13px] text-[#5C5D64]">
              {stats.active} {ltPlural(stats.active, "aktyvi", "aktyvios", "aktyvių")} iš {stats.total}
              {stats.minLabel ? ` · ${stats.minLabel}` : ""}
            </p>
          </div>
        </div>

        <div className={`${STUDIO_CARD} overflow-hidden`}>
          <div className="border-b border-[#EEEEF0] px-4 py-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paieška…"
              className={`h-9 w-full rounded-[10px] border border-[#E8E8EB] px-3 text-sm ${FOCUS_RING}`}
            />
          </div>
          <div>
            {visibleRows.map((item) => {
              const draft = editingId === item.id && editDraft ? editDraft : draftFromItem(item);
              const editing = editingId === item.id;
              const dirty = editing && editDraft ? draftsDiffer(editDraft, draftFromItem(item)) : false;
              return (
                <div
                  key={item.id}
                  className={[
                    "border-b border-[#EEEEF0] px-4 py-3 last:border-b-0",
                    item.active || editing ? "" : "opacity-60",
                    dirty ? "bg-[#F7EEF0]/40" : "",
                  ].join(" ")}
                >
                  {editing && editDraft ? (
                    <CatalogRowEditor
                      draft={editDraft}
                      pending={pending}
                      error={error}
                      onChange={(next) => setEditDraft((prev) => (prev ? { ...prev, ...next } : prev))}
                      onCancel={cancelEdit}
                      onSave={() => saveEdit(item)}
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-[#17171B]">{item.label}</p>
                        <p className="mt-0.5 text-[12px] text-[#6F7077]">
                          {draft.kind !== "fixed" ? `${KIND_LABEL[draft.kind]} · ` : ""}
                          {item.active ? "Aktyvi" : "Neaktyvi"}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-[#17171B]">{priceLabel(draft)}</p>
                      <button
                        type="button"
                        className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[13px] font-medium text-[#7C4A57] hover:bg-[#F7EEF0] ${FOCUS_RING}`}
                        onClick={() => beginEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        Keisti
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {visibleRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-[#6F7077]">
                {query.trim() ? "Nėra eilučių pagal paiešką." : "Šioje kategorijoje kainų nėra."}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[840px]">
      <div className="mb-4">
        <h2 className="text-[22px] font-semibold tracking-tight text-[#17171B]">Kainynas</h2>
        <p className="mt-1 text-[13px] text-[#5C5D64]">Bazinių kainų katalogas. Grupės tik užpildo nuolaidų procentus.</p>
      </div>
      <div className="grid gap-3">
        {grouped.map(({ category, rows }) => {
          const stats = categoryStats(rows);
          return (
            <div key={category} className={`${STUDIO_CARD} p-4`}>
              <div className="flex items-start gap-3">
                <CategoryIcon category={category} />
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold text-[#17171B]">{CATEGORY_LABEL[category]}</div>
                  <div className="mt-0.5 text-[13px] text-[#6F7077]">
                    {stats.total === 0
                      ? "Kainų nėra"
                      : `${stats.active} ${ltPlural(stats.active, "aktyvi", "aktyvios", "aktyvių")} iš ${stats.total}${
                          stats.minLabel ? ` · ${stats.minLabel}` : ""
                        }`}
                  </div>
                  <button
                    type="button"
                    className={`mt-3 text-[13px] font-medium text-[#7C4A57] hover:underline ${FOCUS_RING} rounded-[8px]`}
                    onClick={() => setOpenCategory(category)}
                  >
                    Keisti kainas
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
