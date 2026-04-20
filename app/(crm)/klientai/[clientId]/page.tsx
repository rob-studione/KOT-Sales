import Link from "next/link";
import { redirect } from "next/navigation";
import { TablePagination } from "@/components/crm/TablePagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayInvoiceNumberFromRow } from "@/lib/crm/invoiceDisplayNumber";
import { clampPageIndex0, parsePageIndex0, parsePageSize, showingRange1Based, totalPagesFromCount } from "@/lib/crm/pagination";
import { displayClientName, formatCompanyCodeDetail, formatDate, formatMoney } from "@/lib/crm/format";
import { ORPHAN_CLIENT_PATH_SEGMENT } from "@/lib/crm/clientRouting";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId: clientIdParam } = await params;
  const sp = await searchParams;
  const segment = decodeURIComponent(clientIdParam);

  const requestedPageIndex0 = parsePageIndex0(sp.page);
  const pageSize = parsePageSize(sp.pageSize);

  const supabase = createSupabaseServerClient();

  const { data: summary, error: summaryError } =
    segment === ORPHAN_CLIENT_PATH_SEGMENT
      ? await supabase
          .from("v_client_list_from_invoices")
          .select("client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue")
          .eq("client_key", "")
          .maybeSingle()
      : await supabase
          .from("v_client_list_from_invoices")
          .select("client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue")
          .eq("client_id", segment)
          .maybeSingle();

  if (summaryError) {
    return (
      <>
        <Link href="/klientai" className="cursor-pointer rounded-sm text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 hover:underline">
          ← Atgal į klientus
        </Link>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti kliento: {summaryError.message}</p>
      </>
    );
  }

  if (!summary) {
    return (
      <>
        <Link href="/klientai" className="cursor-pointer rounded-sm text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 hover:underline">
          ← Atgal į klientus
        </Link>
        <p className="mt-4 text-sm text-zinc-600">Klientas nerastas (nėra sąskaitų šiam klientui).</p>
      </>
    );
  }

  const filterSummary = {
    company_code: String(summary.company_code ?? ""),
    client_id: String(summary.client_id ?? ""),
    company_name: String(summary.company_name ?? ""),
  };

  let countQuery = supabase.from("invoices").select("*", { count: "exact", head: true });
  if (filterSummary.company_code.trim() !== "") {
    countQuery = countQuery.eq("company_code", filterSummary.company_code.trim());
  } else if (filterSummary.client_id.trim() !== "") {
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
    redirect(`/klientai/${encodeURIComponent(segment)}?${params.toString()}`);
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

  if (!invoicesError) {
    let dataQuery = supabase
      .from("invoices")
      .select("invoice_id,invoice_number,series_title,series_number,invoice_date,amount,created_at")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filterSummary.company_code.trim() !== "") {
      dataQuery = dataQuery.eq("company_code", filterSummary.company_code.trim());
    } else if (filterSummary.client_id.trim() !== "") {
      dataQuery = dataQuery.eq("client_id", filterSummary.client_id.trim()).is("company_code", null);
    } else {
      dataQuery = dataQuery.is("company_code", null).is("client_id", null);
    }

    const from = pageIndex0 * pageSize;
    const to = from + pageSize - 1;
    const { data: invoices, error: dataError } = await dataQuery.range(from, to);
    if (dataError) {
      invoicesError = { message: dataError.message };
    } else {
      invRows = (invoices ?? []) as InvoiceHistoryRow[];
    }
  }

  const clientName = displayClientName(filterSummary.company_name, filterSummary.company_code);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/klientai" className="cursor-pointer rounded-sm text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 hover:underline">
            ← Atgal į klientus
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{clientName}</h1>
          <div className="mt-1 text-sm text-zinc-600">{formatCompanyCodeDetail(filterSummary.company_code)}</div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900">Sąskaitų istorija</div>
        {invoicesError ? (
          <div className="px-4 py-4 text-sm text-red-600">Nepavyko įkelti sąskaitų: {invoicesError.message}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-700">Sąskaitos Nr.</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Sąskaitos data</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-700">Suma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invRows.map((r) => (
                <tr key={r.invoice_id}>
                  <td className="px-4 py-3 font-medium text-zinc-900">{displayInvoiceNumberFromRow(r) || "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatDate(r.invoice_date)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-900">{formatMoney(Number(r.amount ?? 0))}</td>
                </tr>
              ))}
              {invRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Nėra sąskaitų šiam klientui.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}

        <div className="border-t border-zinc-100 px-4 py-3">
          <TablePagination
            basePath={`/klientai/${encodeURIComponent(segment)}`}
            pageIndex0={pageIndex0}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            showingFrom={showingFrom}
            showingTo={showingTo}
            extraQuery={{}}
            ariaLabel="Kliento sąskaitų puslapiai"
          />
        </div>
      </div>
    </div>
  );
}

