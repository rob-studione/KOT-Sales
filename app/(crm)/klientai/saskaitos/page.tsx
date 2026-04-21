import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncInvoicesButton from "@/components/crm/SyncInvoicesButton";
import LastSyncCard from "@/components/crm/LastSyncCard";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { TablePagination } from "@/components/crm/TablePagination";
import { clampPageIndex0, parsePageIndex0, parsePageSize, showingRange1Based, totalPagesFromCount } from "@/lib/crm/pagination";
import { displayInvoiceNumberFromRow } from "@/lib/crm/invoiceDisplayNumber";
import { VAT_INVOICE_SERIES_TITLE_ILIKE } from "@/lib/crm/vatInvoiceListFilter";
import { parseInvoiceSearchInput } from "@/lib/crm/invoiceListSearch";
import { displayClientName, formatCompanyCodeList, formatDate, formatMoney } from "@/lib/crm/format";
import { clientDetailPath } from "@/lib/crm/clientRouting";

export const dynamic = "force-dynamic";

export default async function SaskaitosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const qRaw = sp.q;
  const search = parseInvoiceSearchInput(typeof qRaw === "string" ? qRaw : undefined);

  const requestedPageIndex0 = parsePageIndex0(sp.page);
  const pageSize = parsePageSize(sp.pageSize);

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return (
      <>
        <h1 className="text-xl font-semibold">Sąskaitos</h1>
        <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </>
    );
  }

  let countQuery = supabase.from("invoices").select("*", { count: "exact", head: true }).ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE);

  if (search) {
    const pat = `%${search}%`;
    countQuery = countQuery.or(`company_name.ilike.${pat},company_code.ilike.${pat},invoice_search_display.ilike.${pat}`);
  }

  const [kpiRes, vatKpiCountRes, countResult] = await Promise.all([
    supabase.rpc("vat_invoices_kpis"),
    supabase.from("invoices").select("*", { count: "exact", head: true }).ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE),
    countQuery,
  ]);

  const { count: totalCountRaw, error: countError } = countResult;

  const totalCount = totalCountRaw ?? 0;
  const totalPages = totalPagesFromCount(totalCount, pageSize);
  const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

  if (requestedPageIndex0 !== pageIndex0) {
    const rp = new URLSearchParams();
    if (typeof qRaw === "string" && qRaw.trim()) rp.set("q", qRaw.trim());
    rp.set("page", String(pageIndex0));
    rp.set("pageSize", String(pageSize));
    redirect(`/klientai/saskaitos?${rp.toString()}`);
  }

  const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);
  const from = pageIndex0 * pageSize;
  const to = from + pageSize - 1;

  let rowQuery = supabase
    .from("invoices")
    .select("invoice_id,invoice_date,created_at,amount,company_name,company_code,client_id,invoice_search_display,series_title,series_number,invoice_number")
    .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE)
    .order("invoice_date", { ascending: false })
    .order("invoice_number", { ascending: false })
    .order("created_at", { ascending: false });

  if (search) {
    const pat = `%${search}%`;
    rowQuery = rowQuery.or(`company_name.ilike.${pat},company_code.ilike.${pat},invoice_search_display.ilike.${pat}`);
  }

  const { data, error } = await rowQuery.range(from, to);

  const kpiMissing = Boolean(kpiRes.error);
  const kpis =
    !kpiRes.error && kpiRes.data
      ? (kpiRes.data as unknown as { total_amount?: unknown; total_count?: unknown })
      : null;

  const vatCount = (vatKpiCountRes as unknown as { count?: number | null })?.count ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Sąskaitos</h1>
          <p className="mt-1 text-sm text-zinc-600">PVM sąskaitos iš invoice123 (filtruojamos pagal seriją).</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncInvoicesButton />
        </div>
      </div>

      <LastSyncCard />

      <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ListPageSearchForm
            action="/klientai/saskaitos"
            defaultQuery={typeof qRaw === "string" ? qRaw : ""}
            placeholder="Paieška (pavadinimas, kodas, sąskaita…)"
            inputId="crm-saskaitos-search"
            hiddenFields={{}}
          />
          <div className="text-xs text-zinc-500">
            Rodoma {showingFrom}–{showingTo} iš {totalCount.toLocaleString("lt-LT")}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Sąskaita</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Klientas</th>
              <th className="px-4 py-3 text-right">Suma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(data ?? []).map((r: any) => {
              const invNo = displayInvoiceNumberFromRow(r);
              const amount = Number(r.amount ?? 0);
              const date = r.invoice_date ? String(r.invoice_date) : "";
              const clientName = displayClientName(r.company_name, r.company_code);
              const companyCode = String(r.company_code ?? "").trim();
              const clientId = String(r.client_id ?? "").trim();
              const clientHref = clientDetailPath(companyCode || null, clientId || null);
              return (
                <tr key={String(r.invoice_id)}>
                  <td className="px-4 py-3 font-medium text-zinc-900">{invNo || "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{date ? formatDate(date) : "—"}</td>
                  <td className="px-4 py-3">
                    {clientHref ? (
                      <Link href={clientHref} className="text-zinc-900 hover:underline">
                        {clientName}
                      </Link>
                    ) : (
                      <span className="text-zinc-900">{clientName}</span>
                    )}
                    <div className="text-xs text-zinc-500">{formatCompanyCodeList(companyCode)}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-900">{formatMoney(amount)}</td>
                </tr>
              );
            })}
            {error ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-sm text-red-600">
                  Nepavyko įkelti sąskaitų: {error.message}
                </td>
              </tr>
            ) : null}
            {!error && (data ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Nėra sąskaitų pagal pasirinktą filtrą.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {(() => {
        const r = showingRange1Based(pageIndex0, pageSize, totalCount);
        const qTrim = typeof qRaw === "string" ? qRaw.trim() : "";
        return (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <TablePagination
              basePath="/klientai/saskaitos"
              pageIndex0={pageIndex0}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              showingFrom={r.from}
              showingTo={r.to}
              extraQuery={{ q: qTrim || undefined }}
              ariaLabel="Sąskaitų puslapiai"
            />
          </div>
        );
      })()}

      <div className="rounded-xl border border-zinc-200/80 bg-white p-4 text-sm text-zinc-700 shadow-sm">
        <div className="font-medium text-zinc-900">KPI (PVM sąskaitos)</div>
        {kpiMissing ? (
          <p className="mt-1 text-xs text-amber-700">KPI RPC nerastas (vat_invoices_kpis). KPI blokas bus tuščias.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-zinc-500">Kiekis:</span> <span className="font-medium">{Number(kpis?.total_count ?? vatCount ?? 0).toLocaleString("lt-LT")}</span>
            </div>
            <div>
              <span className="text-zinc-500">Suma:</span>{" "}
              <span className="font-medium">{formatMoney(Number(kpis?.total_amount ?? 0))}</span>
            </div>
          </div>
        )}
      </div>

      {countError ? (
        <p className="text-sm text-red-600">Nepavyko suskaičiuoti sąskaitų: {countError.message}</p>
      ) : null}
    </div>
  );
}

