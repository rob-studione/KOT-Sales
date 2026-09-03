import { normalizeExpressCompanyCode } from "@/lib/crm/expressProcurementRecipient";

export type ProposalRecipientSearchRow = {
  recipientType: "client" | "lead";
  recipientId: string;
  recipientName: string;
  companyCode: string | null;
  workItemId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
};

/**
 * Klientas pagal kodą laimi, tada esamas lead bet kuriame projekte,
 * tada Kanban kortelė. Tas pats kodas nerodomas dukart.
 */
export function mergeProposalRecipientSearchResults<T extends ProposalRecipientSearchRow>(input: {
  clients: T[];
  leads: T[];
  workItems: T[];
}): T[] {
  const clientCodes = new Set(
    input.clients.map((row) => normalizeExpressCompanyCode(row.companyCode)).filter(Boolean)
  );
  const leadCodes = new Set(
    input.leads.map((row) => normalizeExpressCompanyCode(row.companyCode)).filter(Boolean)
  );
  const seenWorkCodes = new Set<string>();
  const seenWorkIds = new Set<string>();
  const workItems: T[] = [];

  for (const row of input.workItems) {
    const code = normalizeExpressCompanyCode(row.companyCode);
    if (code && (clientCodes.has(code) || leadCodes.has(code))) continue;
    if (code) {
      if (seenWorkCodes.has(code)) continue;
      seenWorkCodes.add(code);
    } else {
      const id = String(row.workItemId || row.recipientId || "").trim();
      if (!id || seenWorkIds.has(id)) continue;
      seenWorkIds.add(id);
    }
    workItems.push(row);
  }

  return [...input.clients, ...input.leads, ...workItems];
}
