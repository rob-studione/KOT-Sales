export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";

export default async function KpiSettingsPage() {
  redirect("/analitika/kpi");
}
