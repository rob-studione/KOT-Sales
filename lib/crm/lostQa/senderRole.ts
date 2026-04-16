import "server-only";

import type { LostSenderRole } from "@/lib/crm/lostQaDb";
import { lostQaCompanyEmailDomains } from "@/lib/crm/lostQa/gmailEnv";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function isMailboxSender(email: string, mailboxEmail: string): boolean {
  return normalizeEmail(email) === normalizeEmail(mailboxEmail);
}

function isCompanyDomainEmail(email: string, companyDomains: string[]): boolean {
  const d = domainOf(email);
  if (!d) return false;
  return companyDomains.includes(d);
}

function isSystemLikeLocalPart(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (!local) return false;
  if (local.includes("noreply") || local.includes("no-reply")) return true;
  if (local === "mailer-daemon" || local.startsWith("postmaster")) return true;
  if (local === "donotreply" || local === "do-not-reply") return true;
  return false;
}

/**
 * Centralized sender classification for Lost QA message normalization.
 *
 * Rules (high level):
 * - Same address as mailbox → agent
 * - Company domain list → agent if “sales-like” local part else internal (heuristic: short generic locals → internal)
 * - Automated / noreply patterns → system
 * - Otherwise external → client
 * - If not determinable → unknown
 */
export function classifySenderRole(senderEmail: string, mailboxEmailAddress: string): LostSenderRole {
  const email = normalizeEmail(senderEmail);
  if (!email || !email.includes("@")) return "unknown";

  if (isMailboxSender(email, mailboxEmailAddress)) return "agent";

  const companyDomains = lostQaCompanyEmailDomains();
  if (companyDomains.length > 0 && isCompanyDomainEmail(email, companyDomains)) {
    const local = email.split("@")[0] ?? "";
    if (/^(sales|support|hello|info|team|crm)$/.test(local)) return "agent";
    return "internal";
  }

  if (isSystemLikeLocalPart(email)) return "system";

  return "client";
}

/**
 * Inbound vs outbound relative to the monitored mailbox / customer conversation.
 */
export function inferIsInbound(role: LostSenderRole, senderEmail: string): boolean {
  if (role === "client") return true;
  if (role === "agent" || role === "internal") return false;
  if (role === "system") return false;
  const companyDomains = lostQaCompanyEmailDomains();
  if (senderEmail && companyDomains.length > 0 && isCompanyDomainEmail(senderEmail, companyDomains)) return false;
  return true;
}
