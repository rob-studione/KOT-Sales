import { redirect } from "next/navigation";
import { CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalyticsClientTable } from "@/components/crm/AnalyticsClientTable";
import { TablePagination } from "@/components/crm/TablePagination";
import {
  ACTIVE_WINDOW_MONTHS,
  calendarDateMonthsAgo,
} from "@/lib/crm/analyticsDates";
import { mapRawToClientListRow } from "@/lib/crm/mapClientViewRow";
import {
  clampPageIndex0,
  parsePageIndex0,
  parsePageSize,
  showingRange1Based,
  totalPagesFromCount,
} from "@/lib/crm/pagination";
import { formatDate } from "@/lib/crm/format";

export const dynamic = "force-dynamic";

const LOG = "[crm/analitika/aktyvus]";

export default async function AktyvusKlientaiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const requestedPageIndex0 = parsePageIndex0(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const activeCutoff = calendarDateMonthsAgo(ACTIVE_WINDOW_MONTHS);

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Aktyvūs klientai" />
        <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </CrmTableContainer>
    );
  }

  const countQuery = supabase
    .from("v_client_list_from_invoices")
    .select("*", { count: "exact", head: true })
    .gte("last_invoice_date", activeCutoff);

  const { count: totalCountRaw, error: countError } = await countQuery;

  if (countError) {
    console.error(LOG, { step: "count", message: countError.message });
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Aktyvūs klientai" />
        <p className="mt-4 text-sm text-red-600">Nepavyko skaičiuoti: {countError.message}</p>
      </CrmTableContainer>
    );
  }

  const totalCount = totalCountRaw ?? 0;
  const totalPages = totalPagesFromCount(totalCount, pageSize);
  const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

  if (requestedPageIndex0 !== pageIndex0) {
    const rp = new URLSearchParams();
    rp.set("page", String(pageIndex0));
    rp.set("pageSize", String(pageSize));
    redirect(`/analitika/aktyvus?${rp.toString()}`);
  }

  const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);
  const from = pageIndex0 * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from("v_client_list_from_invoices")
    .select(
      "client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue"
    )
    .gte("last_invoice_date", activeCutoff)
    .order("last_invoice_date", { ascending: false })
    .order("total_revenue", { ascending: false })
    .range(from, to);

  if (error) {
    console.error(LOG, { step: "rows", message: error.message });
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Aktyvūs klientai" />
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti: {error.message}</p>
      </CrmTableContainer>
    );
  }

  const rows = (data ?? []).map((r) => mapRawToClientListRow(r));

  return (
    <CrmTableContainer>
      <CrmListPageIntro
        title="Aktyvūs klientai"
        description={
          <>
            Bent viena sąskaita nuo <span className="font-medium text-gray-800">{formatDate(activeCutoff)}</span>{" "}
            (įskaitant) — paskutinės sąskaitos
            data iš <code className="rounded bg-gray-100 px-1 text-xs text-gray-800">v_client_list_from_invoices.last_invoice_date</code> (
            {ACTIVE_WINDOW_MONTHS} mėn. langas).
          </>
        }
      />

      <CrmListPageMain>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <AnalyticsClientTable rows={rows} />
          <TablePagination
            basePath="/analitika/aktyvus"
            pageIndex0={pageIndex0}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            showingFrom={showingFrom}
            showingTo={showingTo}
            extraQuery={{}}
            ariaLabel="Aktyvių klientų puslapiai"
          />
        </div>
      </CrmListPageMain>
    </CrmTableContainer>
  );
}
