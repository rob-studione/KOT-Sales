export type ExpressProposalMode = "create" | "draft" | "generated";

export type ExpressProposalState = "none" | "draft" | "generated";

export function commercialProposalPdfHref(proposalId: string, download = false): string {
  const q = download ? "?download=1" : "";
  return `/api/crm/commercial-proposals/${encodeURIComponent(proposalId)}/pdf${q}`;
}

export function triggerProposalPdfDownload(proposalId: string) {
  const a = document.createElement("a");
  a.href = commercialProposalPdfHref(proposalId, true);
  a.download = "commercial-proposal.pdf";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
