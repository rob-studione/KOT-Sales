export const dynamic = "force-dynamic";

export default async function AktyvusKlientaiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.trim() !== "") p.set(k, v);
    else if (Array.isArray(v) && v.length > 0) p.set(k, v[0] ?? "");
  }
  p.set("view", "active");
  const { redirect } = await import("next/navigation");
  redirect(`/klientai?${p.toString()}`);
}

