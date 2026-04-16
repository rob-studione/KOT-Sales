import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SyncInvoicesButton from "@/components/crm/SyncInvoicesButton";
import LastSyncCard from "@/components/crm/LastSyncCard";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { TablePagination } from "@/components/crm/TablePagination";
import {
  clampPageIndex0,
  parsePageIndex0,
  parsePageSize,
  showingRange1Based,
  totalPagesFromCount,
} from "@/lib/crm/pagination";
import { displayInvoiceNumberFromRow } from "@/lib/crm/invoiceDisplayNumber";
import { VAT_INVOICE_SERIES_TITLE_ILIKE } from "@/lib/crm/vatInvoiceListFilter";
import { parseInvoiceSearchInput } from "@/lib/crm/invoiceListSearch";
import { displayClientName, formatCompanyCodeList, formatDate, formatMoney } from "@/lib/crm/format";
import { clientDetailPath } from "@/lib/crm/clientRouting";
import { sumVatInvoiceAmounts } from "@/lib/crm/vatInvoiceKpis";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
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

  const [kpiRes, vatKpiCountRes, countResult] = await Promise.all([
    supabase.rpc("vat_invoices_kpis"),
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE),
    countQuery,
  ]);

  const { count: totalCountRaw, error: countError } = countResult;

  if (kpiRes.error) {
    const err = kpiRes.error;
    const msg = typeof err.message === "string" ? err.message : "";
    const missingRpc =
      err.code === "PGRST202" ||
      /could not find the function/i.test(msg) ||
      /function .* does not exist/i.test(msg);
    if (!missingRpc) {
      console.error("[invoices] vat_invoices_kpis failed", {
        message: msg || String(err),
        code: err.code,
        details: err.details,
        hint: err.hint,
      });
    }
  }

  /** Sąskaitų skaičius — atskira head užklausa (veikia be RPC). */
  const invoiceKpiCount = vatKpiCountRes.error ? null : (vatKpiCountRes.count ?? 0);

  /** Apyvarta: pirmiausia RPC; jei jo nėra ar klaida — suma iš amount eilučių (be agregatų). */
  let totalRevenueKpi: number | null = null;
  if (!kpiRes.error && kpiRes.data?.[0] != null) {
    const raw = (kpiRes.data[0] as { total_amount?: unknown }).total_amount;
    const n = typeof raw === "number" ? raw : Number(raw);
    totalRevenueKpi = Number.isFinite(n) ? n : null;
  }
  if (totalRevenueKpi === null) {
    totalRevenueKpi = await sumVatInvoiceAmounts(supabase);
  }

  const kpiWarning =
    vatKpiCountRes.error != null || totalRevenueKpi === null;

  if (countError) {
    return (
      <>
        <h1 className="text-xl font-semibold">Sąskaitos</h1>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti sąskaitų: {countError.message}</p>
        {countError.message.includes("invoice_search_display") ? (
          <p className="mt-2 text-xs text-zinc-500">
            Pridėkite migraciją <code className="rounded bg-zinc-100 px-1">0010_invoice_search_display.sql</code>.
          </p>
        ) : null}
      </>
    );
  }

  const totalCount = totalCountRaw ?? 0;
  const totalPages = totalPagesFromCount(totalCount, pageSize);
  const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

  if (requestedPageIndex0 !== pageIndex0) {
    const rp = new URLSearchParams();
    if (search) rp.set("q", search);
    rp.set("page", String(pageIndex0));
    rp.set("pageSize", String(pageSize));
    redirect(`/invoices?${rp.toString()}`);
  }

  const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);
  const from = pageIndex0 * pageSize;
  const to = from + pageSize - 1;

  let dataQuery = supabase
    .from("invoices")
    .select(
      "invoice_id,invoice_number,series_title,series_number,company_code,company_name,client_id,invoice_date,amount"
    )
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
      <>
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
      </>
    );
  }

  const rows =
    data ??
    ([] as Array<{
      invoice_id: string;
      invoice_number: string | null;
      series_title: string | null;
      series_number: number | null;
      company_code: string | null;
      company_name: string | null;
      client_id: string | null;
      invoice_date: string;
      amount: string | number;
    }>);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Sąskaitos</h1>
        <p className="mt-0.5 text-sm text-zinc-600">
          Rodomos tik PVM sąskaitos (serija VK-), kaip Saskaita123 pagrindiniame sąraše.
        </p>
      </div>

      <SyncInvoicesButton />

      <LastSyncCard />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-500">Sąskaitų skaičius</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
            {vatKpiCountRes.error ? "—" : invoiceKpiCount}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-500">Bendra apyvarta</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">
            {totalRevenueKpi === null ? "—" : formatMoney(totalRevenueKpi)}
          </div>
        </div>
      </div>

      {kpiWarning ? (
        <p className="text-xs text-amber-700">
          Suvestinės rodiklių nepavyko įkelti. Bandykite atnaujinti puslapį.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex justify-end bg-white px-2 pb-1.5 pt-1.5 sm:px-4 sm:pt-2">
          <ListPageSearchForm
            action="/invoices"
            inputId="invoices-q"
            defaultQuery={search}
            hiddenFields={{
              page: "0",
              pageSize: String(pageSize),
            }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white">
              <tr className="border-b border-zinc-100 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                <th className="px-4 pb-2 pt-0 font-medium">Sąskaitos Nr.</th>
                <th className="px-4 pb-2 pt-0 font-medium">Klientas</th>
                <th className="px-4 pb-2 pt-0 font-medium">Įmonės kodas</th>
                <th className="px-4 pb-2 pt-0 font-medium">Sąskaitos data</th>
                <th className="px-4 pb-2 pt-0 text-right font-medium">Suma</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
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
                  const displayNo = displayInvoiceNumberFromRow(row);
                  return (
                    <tr key={row.invoice_id} className="border-t border-zinc-100 transition-colors hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium text-zinc-900">{displayNo}</td>
                      <td className="px-4 py-2">
                        <Link
                          href={href}
                          className="cursor-pointer rounded-sm text-zinc-900 hover:bg-zinc-100 hover:underline"
                        >
                          {name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-700">
                        {formatCompanyCodeList(row.company_code)}
                      </td>
                      <td className="px-4 py-2 text-zinc-700">{formatDate(row.invoice_date)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-900">{formatMoney(row.amount)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          basePath="/invoices"
          pageIndex0={pageIndex0}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          showingFrom={showingFrom}
          showingTo={showingTo}
          extraQuery={search ? { q: search } : undefined}
          ariaLabel="Sąskaitų sąrašo puslapiai"
        />
      </div>
    </div>
  );
}
