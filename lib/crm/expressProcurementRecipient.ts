export type ExpressPendingLead = {
  companyName: string;
  companyCode: string;
  email: string | null;
  phone: string | null;
  contactName: string | null;
};

export type ExpressProcurementClassification =
  | { kind: "client"; matchedBy: "company_code" }
  | { kind: "existing_lead"; matchedBy: "company_code" }
  | { kind: "pending_lead" }
  | { kind: "blocked"; error: string };

export function normalizeExpressCompanyCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "");
}

export function classifyExpressProcurementRecipient(input: {
  hasCrmClient: boolean;
  hasExistingLead: boolean;
  organizationName: string | null;
  organizationCode: string | null;
}): ExpressProcurementClassification {
  const code = normalizeExpressCompanyCode(input.organizationCode);
  const name = String(input.organizationName ?? "").trim();

  if (code && input.hasCrmClient) {
    return { kind: "client", matchedBy: "company_code" };
  }
  if (code && input.hasExistingLead) {
    return { kind: "existing_lead", matchedBy: "company_code" };
  }
  if (!code && !name) {
    return {
      kind: "blocked",
      error: "Šiai sutarčiai trūksta organizacijos pavadinimo ir įmonės kodo, todėl pasiūlymo kurti negalima.",
    };
  }
  if (!code) {
    return {
      kind: "blocked",
      error: "Šiai sutarčiai nėra įmonės kodo, todėl gavėjo nustatyti negalima.",
    };
  }
  if (!name) {
    return {
      kind: "blocked",
      error: "Šiai sutarčiai nėra organizacijos pavadinimo, todėl pasiūlymo kurti negalima.",
    };
  }
  return { kind: "pending_lead" };
}

export function pendingLeadFromProcurement(input: {
  organizationName: string;
  organizationCode: string;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
}): ExpressPendingLead {
  return {
    companyName: input.organizationName.trim(),
    companyCode: normalizeExpressCompanyCode(input.organizationCode),
    email: input.email?.trim() ? input.email.trim() : null,
    phone: input.phone?.trim() ? input.phone.trim() : null,
    contactName: input.contactName?.trim() ? input.contactName.trim() : null,
  };
}
