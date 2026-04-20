import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ORPHAN_CLIENT_PATH_SEGMENT } from "@/lib/crm/clientRouting";

export const dynamic = "force-dynamic";

export default async function LegacyClientDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ company_code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { company_code: companyCodeParam } = await params;
  const sp = await searchParams;
  const segment = decodeURIComponent(companyCodeParam);

  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) qp.set(k, v);
    else if (Array.isArray(v)) for (const it of v) if (it) qp.append(k, it);
  }

  if (segment === ORPHAN_CLIENT_PATH_SEGMENT) {
    redirect(qp.toString() ? `/klientai/${encodeURIComponent(segment)}?${qp.toString()}` : `/klientai/${encodeURIComponent(segment)}`);
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_client_list_from_invoices")
    .select("client_id")
    .eq("client_key", segment)
    .maybeSingle();

  const clientId = String((data as any)?.client_id ?? "").trim();
  if (error || !clientId) redirect("/klientai");

  redirect(qp.toString() ? `/klientai/${encodeURIComponent(clientId)}?${qp.toString()}` : `/klientai/${encodeURIComponent(clientId)}`);
}
