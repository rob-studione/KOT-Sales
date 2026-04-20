import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyApzvalgaRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) qp.set(k, v);
    else if (Array.isArray(v)) for (const it of v) if (it) qp.append(k, it);
  }
  redirect(qp.toString() ? `/dashboard?${qp.toString()}` : "/dashboard");
}

