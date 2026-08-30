"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecipientSelector } from "@/components/crm/commercial-proposal/RecipientSelector";
import {
  createCommercialProposalAction,
  type ProposalRecipientOption,
} from "@/lib/crm/commercialProposalActions";
import { commercialProposalPath } from "@/lib/crm/commercialProposalPaths";

export function ProposalCreateClient({
  preset,
  onCancel,
  asDialog,
}: {
  preset?: ProposalRecipientOption | null;
  onCancel?: () => void;
  asDialog?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ProposalRecipientOption | null>(preset ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function createDraft() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await createCommercialProposalAction({
        recipientType: selected.recipientType,
        recipientId: selected.recipientId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(commercialProposalPath(res.id));
    });
  }

  return (
    <div className={asDialog ? "" : "mx-auto max-w-xl"}>
      <div className={asDialog ? "" : "rounded-[14px] border border-[#E8E8EB] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"}>
        {!asDialog ? (
          <>
            <h2 className="text-[16px] font-semibold text-[#17171B]">Gavėjas</h2>
            <p className="mt-1 text-[13px] text-[#6F7077]">Pasirinkite esamą klientą arba leadą. Be gavėjo juodraštis nesukuriamas.</p>
          </>
        ) : null}

        <div className={asDialog ? "" : "mt-4"}>
          <RecipientSelector selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} autoFocus />
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {onCancel ? (
            <button type="button" className="h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:underline" onClick={onCancel}>
              Atšaukti
            </button>
          ) : null}
          <button
            type="button"
            disabled={!selected || pending}
            className="inline-flex h-9 items-center rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={createDraft}
          >
            Sukurti juodraštį
          </button>
        </div>
      </div>
    </div>
  );
}
