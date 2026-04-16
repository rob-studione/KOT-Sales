import Link from "next/link";
import { redirect } from "next/navigation";
import { TablePagination } from "@/components/crm/TablePagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayInvoiceNumberFromRow } from "@/lib/crm/invoiceDisplayNumber";
import {
  clampPageIndex0,
  parsePageIndex0,
  parsePageSize,
  showingRange1Based,
  totalPagesFromCount,
} from "@/lib/crm/pagination";
import { displayClientName, formatCompanyCodeDetail, formatDate, formatMoney } from "@/lib/crm/format";
import { ORPHAN_CLIENT_PATH_SEGMENT } from "@/lib/crm/clientRouting";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ company_code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { company_code: companyCodeParam } = await params;
  const sp = await searchParams;
  const segment = decodeURIComponent(companyCodeParam);

  const requestedPageIndex0 = parsePageIndex0(sp.page);
  const pageSize = parsePageSize(sp.pageSize);

  const supabase = createSupabaseServerClient();

  const { data: summary, error: summaryError } =
    segment === ORPHAN_CLIENT_PATH_SEGMENT
      ? await supabase
          .from("v_client_list_from_invoices")
          .select(
            "client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue"
          )
          .eq("client_key", "")
          .maybeSingle()
      : await supabase
          .from("v_client_list_from_invoices")
          .select(
            "client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue"
          )
          .eq("client_key", segment)
          .maybeSingle();

  if (summaryError) {
    return (
      <>
        <Link href="/clients" className="cursor-pointer rounded-sm text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 hover:underline">
          ← Atgal į klientus
        </Link>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti kliento: {summaryError.message}</p>
      </>
    );
  }

  if (!summary) {
    return (
      <>
        <Link href="/clients" className="cursor-pointer rounded-sm text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 hover:underline">
          ← Atgal į klientus
        </Link>
        <p className="mt-4 text-sm text-zinc-600">Klientas nerastas (nėra sąskaitų šiam kodui).</p>
      </>
    );
  }

  const filterSummary = {
    company_code: summary.company_code,
    client_id: summary.client_id,
  };

  let countQuery = supabase.from("invoices").select("*", { count: "exact", head: true });
  if (filterSummary.company_code != null && filterSummary.company_code.trim() !== "") {
    countQuery = countQuery.eq("company_code", filterSummary.company_code.trim());
  } else if (filterSummary.client_id != null && filterSummary.client_id.trim() !== "") {
    countQuery = countQuery.eq("client_id", filterSummary.client_id.trim()).is("company_code", null);
  } else {
    countQuery = countQuery.is("company_code", null).is("client_id", null);
  }

  const { count: totalCountRaw, error: countError } = await countQuery;
  const totalCount = totalCountRaw ?? 0;

  const totalPages = totalPagesFromCount(totalCount, pageSize);
  const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

  if (requestedPageIndex0 !== pageIndex0) {
    const params = new URLSearchParams();
    params.set("page", String(pageIndex0));
    params.set("pageSize", String(pageSize));
    redirect(`/clients/${encodeURIComponent(segment)}?${params.toString()}`);
  }

  const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);

  type InvoiceHistoryRow = {
    invoice_id: string;
    invoice_number?: string | null;
    series_title?: string | null;
    series_number?: number | null;
    invoice_date: string;
    amount: unknown;
    created_at: string;
  };

  let invRows: InvoiceHistoryRow[] = [];
  let invoicesError: { message: string } | null = countError ? { message: countError.message } : null;

  if (!countError && totalCount > 0) {
    const from = pageIndex0 * pageSize;
    const to = from + pageSize - 1;

    let dataQuery = supabase
      .from("invoices")
      .select("invoice_id,invoice_number,series_title,series_number,invoice_date,amount,created_at");
    if (filterSummary.company_code != null && filterSummary.company_code.trim() !== "") {
      dataQuery = dataQuery.eq("company_code", filterSummary.company_code.trim());
    } else if (filterSummary.client_id != null && filterSummary.client_id.trim() !== "") {
      dataQuery = dataQuery.eq("client_id", filterSummary.client_id.trim()).is("company_code", null);
    } else {
      dataQuery = dataQuery.is("company_code", null).is("client_id", null);
    }
    dataQuery = dataQuery
      .order("invoice_date", { ascending: false })
      .order("invoice_id", { ascending: false });

    const { data: invoices, error: dataError } = await dataQuery.range(from, to);

    if (dataError) {
      invoicesError = { message: dataError.message };
    } else {
      invRows = (invoices ?? []) as InvoiceHistoryRow[];
    }
  }

  const displayTitle = displayClientName(summary.company_name, summary.company_code);
  const basePath = `/clients/${encodeURIComponent(segment)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href="/clients" className="cursor-pointer rounded-sm text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 hover:underline">
            ← Atgal į klientus
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{displayTitle}</h1>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-zinc-600 sm:grid-cols-2">
            <div>
              <dt className="inline text-zinc-500">Įmonės kodas</dt>
              <dd className="inline ml-2 font-mono text-zinc-900">{formatCompanyCodeDetail(summary.company_code)}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">PVM kodas</dt>
              <dd className="inline ml-2 text-zinc-900">{summary.vat_code?.trim() ? summary.vat_code : "—"}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">El. paštas</dt>
              <dd className="inline ml-2 text-zinc-900">{summary.email?.trim() ? summary.email : "—"}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">Tel. nr.</dt>
              <dd className="inline ml-2 text-zinc-900">{summary.phone?.trim() ? summary.phone : "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline text-zinc-500">Adresas</dt>
              <dd className="inline ml-2 text-zinc-900">{summary.address?.trim() ? summary.address : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium text-zinc-500">Paskutinė sąskaita</div>
          <div className="mt-2 text-lg font-semibold text-zinc-900">{formatDate(summary.last_invoice_date)}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium text-zinc-500">Sąskaitų skaičius</div>
          <div className="mt-2 text-lg font-semibold tabular-nums text-zinc-900">
            {Number(summary.invoice_count ?? 0)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium text-zinc-500">Bendra apyvarta</div>
          <div className="mt-2 text-lg font-semibold text-zinc-900">{formatMoney(summary.total_revenue)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Sąskaitų istorija</h2>
        </div>

        {invoicesError ? (
          <div className="px-4 py-4 text-sm text-red-600">Nepavyko įkelti sąskaitų: {invoicesError.message}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-zinc-700">Sąskaitos Nr.</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Sąskaitos data</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Suma</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Įrašyta</th>
                </tr>
              </thead>
              <tbody>
                {invRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      Sąskaitų nėra.
                    </td>
                  </tr>
                ) : (
                  invRows.map((inv) => (
                    <tr key={inv.invoice_id} className="border-t border-zinc-100 transition-colors hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {displayInvoiceNumberFromRow(inv)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{formatDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-zinc-900">{formatMoney(inv.amount)}</td>
                      <td className="px-4 py-3 text-zinc-700">{formatDate(inv.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination
          basePath={basePath}
          pageIndex0={pageIndex0}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          showingFrom={showingFrom}
          showingTo={showingTo}
          ariaLabel="Sąskaitų puslapiai"
        />
      </div>
    </div>
  );
}
