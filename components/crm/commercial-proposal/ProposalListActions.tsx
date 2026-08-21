"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateCommercialProposalAction } from "@/lib/crm/commercialProposalActions";
import { commercialProposalPath } from "@/lib/crm/commercialProposalPaths";
import { ProposalDeleteControl } from "@/components/crm/commercial-proposal/ProposalDeleteControl";

export function ProposalListActions({
  proposalId,
  proposalNumber,
  status,
  hasPdf,
  canDelete,
  onDeleted,
}: {
  proposalId: string;
  proposalNumber: string | null;
  status: string;
  hasPdf: boolean;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm whitespace-nowrap">
      <Link href={commercialProposalPath(proposalId)} className="text-[#7C4A57] hover:underline">
        Atidaryti
      </Link>
      <a
        href={`/api/crm/commercial-proposals/${proposalId}/preview`}
        target="_blank"
        rel="noreferrer"
        className="text-[#7C4A57] hover:underline"
      >
        Peržiūrėti
      </a>
      {hasPdf ? (
        <a
          href={`/api/crm/commercial-proposals/${proposalId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="text-[#7C4A57] hover:underline"
        >
          Atsisiųsti PDF
        </a>
      ) : null}
      <button
        type="button"
        disabled={pending}
        className="text-[#7C4A57] hover:underline disabled:opacity-50"
        onClick={() => {
          start(async () => {
            const res = await duplicateCommercialProposalAction(proposalId);
            if (res.ok) router.push(commercialProposalPath(res.id));
          });
        }}
      >
        Dubliuoti
      </button>
      {canDelete ? (
        <ProposalDeleteControl
          proposalId={proposalId}
          proposalNumber={proposalNumber}
          status={status}
          variant="link"
          onDeleted={onDeleted}
        />
      ) : null}
    </div>
  );
}
