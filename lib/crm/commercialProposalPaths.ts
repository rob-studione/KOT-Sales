export const CP_TOOL_PATH = "/irankiai/komerciniai-pasiulymai";

export function commercialProposalPath(proposalId: string): string {
  return `${CP_TOOL_PATH}/${proposalId}`;
}

export function commercialProposalTemplatePath(): string {
  return `${CP_TOOL_PATH}/sablonas`;
}

export function commercialProposalPricesPath(): string {
  return `${CP_TOOL_PATH}/kainos`;
}
