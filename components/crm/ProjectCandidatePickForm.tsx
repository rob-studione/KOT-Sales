"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pickClientFromProject } from "@/lib/crm/projectActions";

export type ProjectCandidatePickFormProps =
  | {
      projectId: string;
      defaultAssignee: string;
      candidateType: "auto";
      clientKey: string;
    }
  | {
      projectId: string;
      defaultAssignee: string;
      candidateType: "manual_lead" | "linked_client" | "procurement_contract";
      candidateId: string;
    };

export function ProjectCandidatePickForm(props: ProjectCandidatePickFormProps) {
  const { projectId, defaultAssignee } = props;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const r = await pickClientFromProject(fd);
          if (r.ok) {
            router.refresh();
          } else {
            setError(r.error);
          }
        });
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="candidate_type" value={props.candidateType} />
      {props.candidateType === "auto" ? (
        <input type="hidden" name="client_key" value={props.clientKey} />
      ) : (
        <input type="hidden" name="candidate_id" value={props.candidateId} />
      )}
      <input type="hidden" name="assigned_to" value={defaultAssignee} />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? "…" : "Priskirti sau"}
      </button>
      {error ? <span className="max-w-[12rem] text-right text-[10px] text-red-600">{error}</span> : null}
    </form>
  );
}
