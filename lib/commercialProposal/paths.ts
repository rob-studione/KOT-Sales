import { existsSync } from "fs";
import path from "path";

/**
 * Immutable mapping: template_version → versioned PDF asset in the repo.
 * Never overwrite an existing version file; add a new key + file instead.
 */
export const COMMERCIAL_PROPOSAL_TEMPLATE_ASSETS = {
  LT_COMMERCIAL_V1: "assets/commercial-proposals/LT_COMMERCIAL_V1.pdf",
  LT_COMMERCIAL_V2: "assets/commercial-proposals/LT_COMMERCIAL_V2_design.pdf",
} as const;

export type CommercialProposalTemplateVersion = keyof typeof COMMERCIAL_PROPOSAL_TEMPLATE_ASSETS;

export function isCommercialProposalTemplateVersion(value: string): value is CommercialProposalTemplateVersion {
  return Object.prototype.hasOwnProperty.call(COMMERCIAL_PROPOSAL_TEMPLATE_ASSETS, value);
}

export function resolveTemplatePdfPath(templateVersion: string): string {
  const version = templateVersion.trim() || "LT_COMMERCIAL_V2";
  if (!isCommercialProposalTemplateVersion(version)) {
    throw new Error(`Unknown commercial proposal template version: ${version}`);
  }
  const rel = COMMERCIAL_PROPOSAL_TEMPLATE_ASSETS[version];
  const abs = path.join(process.cwd(), rel);
  if (!existsSync(abs)) {
    throw new Error(`Commercial proposal template asset missing: ${rel}`);
  }
  return abs;
}

export function commercialProposalLibDir(): string {
  return path.join(process.cwd(), "lib", "commercialProposal");
}

export function fontsDir(): string {
  return path.join(commercialProposalLibDir(), "fonts");
}
