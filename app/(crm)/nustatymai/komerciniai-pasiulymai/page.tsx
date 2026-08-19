import { redirect } from "next/navigation";
import { commercialProposalTemplatePath } from "@/lib/crm/commercialProposalPaths";

export default function CommercialProposalSettingsRedirectPage() {
  redirect(commercialProposalTemplatePath());
}
