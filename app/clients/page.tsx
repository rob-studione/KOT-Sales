import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import InvoiceForm from "./InvoiceForm";

type SortOption = "revenue" | "last_invoice_date";

export const dynamic = "force-dynamic";

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatMoney(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return "—";

  // Keep it simple: display as USD. If you need multi-currency later, we can extend.
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "string") return "—";
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qRaw = searchParams.q;
  const q = typeof qRaw === "string" ? qRaw.trim() : "";

  const sortRaw = searchParams.sort;
  const sort: SortOption = sortRaw === "last_invoice_date" ? "last_invoice_date" : "revenue";

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return (
      <div className="min-h-screen p-6 bg-zinc-50">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="mt-4 text-sm text-red-600">
            Supabase is not configured. {message}
          </p>
        </div>
      </div>
    );
  }

  let query = supabase
    .from("companies")
    .select("company_code,name,last_invoice_date,invoice_count,total_revenue");

  if (q) query = query.ilike("name", `%${q}%`);

  if (sort === "last_invoice_date") {
    query = query.order("last_invoice_date", { ascending: false }).order("total_revenue", { ascending: false });
  } else {
    query = query.order("total_revenue", { ascending: false }).order("last_invoice_date", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="mt-4 text-sm text-red-600">Failed to load companies: {error.message}</p>
        </div>
      </div>
    );
  }

  const rows =
    data ??
    ([] as Array<{
      company_code: string;
      name: string | null;
      last_invoice_date: string | null;
      invoice_count: number | null;
      total_revenue: string | number | null;
    }>);

  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const revenueHref = `/clients?${params.toString()}${q ? "&" : ""}sort=revenue`;
  const dateHref = `/clients?${params.toString()}${q ? "&" : ""}sort=last_invoice_date`;

  return (
    <div className="min-h-screen p-6 bg-zinc-50">
      <div className="mx-auto max-w-5xl flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Clients</h1>
            <p className="text-sm text-zinc-600">Search and totals based on invoices</p>
          </div>

          <div className="text-xs text-zinc-500">
            Sort:
            <span className="ml-2">
              {sort === "revenue" ? (
                <span className="font-medium text-zinc-900">Revenue</span>
              ) : (
                <Link className="hover:underline" href={revenueHref}>
                  Revenue
                </Link>
              )}
            </span>
            <span className="ml-3">
              {sort === "last_invoice_date" ? (
                <span className="font-medium text-zinc-900">Last invoice date</span>
              ) : (
                <Link className="hover:underline" href={dateHref}>
                  Last invoice date
                </Link>
              )}
            </span>
          </div>
        </div>

        <InvoiceForm />

        <form method="get" className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium text-zinc-800" htmlFor="q">
              Search by name
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="e.g. Acme"
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          </div>
          <input type="hidden" name="sort" value={sort} />
          <button
            type="submit"
            className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Search
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-zinc-700">Company</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Company code</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Last invoice date</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Invoice count</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Total revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      No companies found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.company_code} className="border-t border-zinc-100 last:border-b-0">
                      <td className="px-4 py-3 font-medium text-zinc-900">{row.name ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-700">{row.company_code}</td>
                      <td className="px-4 py-3 text-zinc-700">{formatDate(row.last_invoice_date)}</td>
                      <td className="px-4 py-3 text-zinc-700">{row.invoice_count ?? 0}</td>
                      <td className="px-4 py-3 text-zinc-900">{formatMoney(row.total_revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

