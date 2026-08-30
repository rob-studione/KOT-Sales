export const STUDIO_CARD =
  "rounded-[14px] border border-[#E8E8EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]";

export const CATEGORY_LABEL = {
  translation: "Vertimas raštu",
  ai_translation: "AI vertimas ir redagavimas",
  additional_service: "Papildomos paslaugos",
} as const;

export function statusLabel(status: string): string {
  if (status === "draft") return "Juodraštis";
  if (status === "generated") return "Sugeneruotas";
  if (status === "sent") return "Išsiųstas";
  return status;
}

export function statusChipClass(status: string): string {
  if (status === "draft") return "border-zinc-300 bg-zinc-50 text-zinc-700";
  if (status === "generated") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "sent") return "border-[#7C4A57]/40 bg-[#F7EEF0] text-[#7C4A57]";
  return "border-zinc-300 bg-zinc-50 text-zinc-700";
}

export function matchesQuery(label: string, q: string): boolean {
  if (!q.trim()) return true;
  return label.toLowerCase().includes(q.trim().toLowerCase());
}

export function ltPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 9) return few;
  return many;
}

export function formatDiscountPct(pct: number): string | null {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `−${n}%`;
}

export function formatDiscountCell(pct: number): string {
  return formatDiscountPct(pct) ?? "—";
}

export function recipientInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
