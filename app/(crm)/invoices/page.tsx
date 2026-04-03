import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncInvoicesButton from "@/components/crm/SyncInvoicesButton";
import LastSyncCard from "@/components/crm/LastSyncCard";
import { ListPagination } from "@/components/crm/ListPagination";
import { CRM_PAGE_SIZE, parsePage, totalPages } from "@/lib/crm/pagination";
import { formatInvoice123DisplayNumber } from "@/lib/crm/invoiceDisplayNumber";
import { VAT_INVOICE_SERIES_TITLE_ILIKE } from "@/lib/crm/vatInvoiceListFilter";
import { parseInvoiceSearchInput } from "@/lib/crm/invoiceListSearch";
import { displayClientName, formatCompanyCodeList } from "@/lib/crm/format";
import { clientDetailPath } from "@/lib/crm/clientRouting";

export const dynamic = "force-dynamic";

function formatDate(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "string") return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("lt-LT");
}

function formatMoney(value: unknown): string {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const pageRaw = sp.page;
  const qRaw = sp.q;
  const search = parseInvoiceSearchInput(typeof qRaw === "string" ? qRaw : undefined);

  const requestedPage = parsePage(typeof pageRaw === "string" ? pageRaw : undefined);

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-xl font-semibold">Sąskaitos</h1>
        <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </div>
    );
  }

  let countQuery = supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE);

  if (search) {
    const pat = `%${search}%`;
    countQuery = countQuery.or(
      `company_name.ilike.${pat},company_code.ilike.${pat},invoice_search_display.ilike.${pat}`
    );
  }

  const { count: totalCountRaw, error: countError } = await countQuery;

  if (countError) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold">Sąskaitos</h1>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti sąskaitų: {countError.message}</p>
        {countError.message.includes("invoice_search_display") ? (
          <p className="mt-2 text-xs text-zinc-500">
            Pridėkite migraciją <code className="rounded bg-zinc-100 px-1">0010_invoice_search_display.sql</code>.
          </p>
        ) : null}
      </div>
    );
  }

  const totalCount = totalCountRaw ?? 0;
  const pages = totalPages(totalCount, CRM_PAGE_SIZE);
  const page = Math.min(requestedPage, pages);
  const from = (page - 1) * CRM_PAGE_SIZE;
  const to = from + CRM_PAGE_SIZE - 1;

  let dataQuery = supabase
    .from("invoices")
    .select("invoice_id,series_title,series_number,company_code,company_name,client_id,invoice_date,amount")
    .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE);

  if (search) {
    const pat = `%${search}%`;
    dataQuery = dataQuery.or(
      `company_name.ilike.${pat},company_code.ilike.${pat},invoice_search_display.ilike.${pat}`
    );
  }

  const { data, error } = await dataQuery
    .order("invoice_date", { ascending: false })
    .order("series_number", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold">Sąskaitos</h1>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti sąskaitų: {error.message}</p>
        {error.message.includes("series_") ? (
          <p className="mt-2 text-xs text-zinc-500">
            Pridėkite migraciją <code className="rounded bg-zinc-100 px-1">0007_invoice_series_display.sql</code>.
          </p>
        ) : null}
        {error.message.includes("invoice_search_display") ? (
          <p className="mt-2 text-xs text-zinc-500">
            Pridėkite migraciją <code className="rounded bg-zinc-100 px-1">0010_invoice_search_display.sql</code>.
          </p>
        ) : null}
      </div>
    );
  }

  const rows =
    data ??
    ([] as Array<{
      invoice_id: string;
      series_title: string | null;
      series_number: number | null;
      company_code: string | null;
      company_name: string | null;
      client_id: string | null;
      invoice_date: string;
      amount: string | number;
    }>);

  function buildPageHref(p: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/invoices?${s}` : "/invoices";
  }

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Sąskaitos</h1>
        <p className="text-sm text-zinc-600">
          Rodomos tik PVM sąskaitos (serija VK-), kaip Saskaita123 pagrindiniame sąraše.
        </p>
      </div>

      <SyncInvoicesButton />

      <LastSyncCard />

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <form method="get" className="flex flex-col gap-3 border-b border-zinc-100 bg-zinc-50/80 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="invoice-q" className="text-sm font-medium text-zinc-800">
              Paieška
            </label>
            <input
              id="invoice-q"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Įveskite sąskaitos informaciją..."
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          </div>
          <button
            type="submit"
            className="h-10 shrink-0 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Ieškoti
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-zinc-700">Sąskaitos Nr.</th>
                <th className="px-3 py-2 font-medium text-zinc-700">Klientas</th>
                <th className="px-3 py-2 font-medium text-zinc-700">Įmonės kodas</th>
                <th className="px-3 py-2 font-medium text-zinc-700">Sąskaitos data</th>
                <th className="px-3 py-2 font-medium text-zinc-700">Suma</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    Sąskaitų nėra.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const clientKey =
                    (row.company_code && row.company_code.trim()) ||
                    (row.client_id && row.client_id.trim()) ||
                    null;
                  const href = clientDetailPath(clientKey);
                  const name = displayClientName(row.company_name, row.company_code);
                  const displayNo = formatInvoice123DisplayNumber(row.series_title, row.series_number);
                  return (
                    <tr key={row.invoice_id} className="border-t border-zinc-100 hover:bg-zinc-50/50">
                      <td className="px-3 py-2 font-medium text-zinc-900">
                        {displayNo ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={href} className="text-zinc-900 hover:underline">
                          {name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-700">
                        {formatCompanyCodeList(row.company_code)}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{formatDate(row.invoice_date)}</td>
                      <td className="px-3 py-2 text-zinc-900">{formatMoney(row.amount)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <ListPagination
          page={page}
          totalCount={totalCount}
          pageSize={CRM_PAGE_SIZE}
          buildHref={buildPageHref}
          variant="invoices"
        />
      </div>
    </div>
  );
}
