import type { CpPricingGroup } from "@/lib/crm/pricingGroups";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#7C4A57] focus-visible:ring-offset-2";

export function PricingGroupPicker({
  groups,
  selectedId,
  disabled,
  onSelect,
}: {
  groups: CpPricingGroup[];
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (group: CpPricingGroup) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <label className="block">
      <span className="text-[12px] font-medium uppercase tracking-wide text-[#6F7077]">Kainodaros grupė</span>
      <select
        value={selectedId ?? ""}
        disabled={disabled}
        aria-label="Kainodaros grupė"
        onChange={(e) => {
          const next = groups.find((g) => g.id === e.target.value);
          if (next) onSelect(next);
        }}
        className={`mt-1.5 h-10 w-full rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-[13px] text-[#17171B] disabled:bg-[#F7F7F8] disabled:text-[#A1A1A6] ${FOCUS_RING}`}
      >
        {selectedId ? null : (
          <option value="" disabled>
            Pasirinkite grupę
          </option>
        )}
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
            {group.is_default ? " (numatytoji)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
