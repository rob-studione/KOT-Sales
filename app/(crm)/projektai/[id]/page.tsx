import { redirect } from "next/navigation";
import { parseProjectDetailTab } from "@/lib/crm/projectPageSearchParams";

export const dynamic = "force-dynamic";

/**
 * `/projektai/[id]` neturi savo turinio — visada nukreipia į konkretų skirtuką
 * (`/projektai/[id]/apzvalga` ir t.t.). Palaiko senus `?tab=...` URL (query → path).
 */
export default async function ProjektasDetailRootPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tabRaw = typeof sp.tab === "string" ? sp.tab : undefined;
  const tab = parseProjectDetailTab(tabRaw);

  const params2 = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "tab") continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (typeof val === "string" && val !== "") params2.set(k, val);
  }
  const qs = params2.toString();
  redirect(`/projektai/${id}/${tab}${qs ? `?${qs}` : ""}`);
}
