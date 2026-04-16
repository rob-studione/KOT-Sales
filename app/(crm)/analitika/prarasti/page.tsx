import Link from "next/link";
import { redirect } from "next/navigation";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalyticsClientTable } from "@/components/crm/AnalyticsClientTable";
import { TablePagination } from "@/components/crm/TablePagination";
import {
  DEFAULT_LOST_MONTHS,
  LOST_PRESET_MONTHS,
  calendarDateMonthsAgo,
  parseLostMonthsParam,
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

const LOG = "[crm/analitika/prarasti]";

/** Default: newest last invoice among lost clients (recently inactive first). */
type PrarastiSort = "last_invoice_date" | "revenue";

function parsePrarastiSort(raw: string | string[] | undefined): PrarastiSort {
  return raw === "revenue" ? "revenue" : "last_invoice_date";
}

function prarastiSearchQuery(months: number, pageSize: number, page: number, sort: PrarastiSort): string {
  const p = new URLSearchParams();
  p.set("months", String(months));
  p.set("page", String(page));
  p.set("pageSize", String(pageSize));
  if (sort === "revenue") p.set("sort", "revenue");
  return p.toString();
}

export default async function PrarastiKlientaiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const months = parseLostMonthsParam(sp.months);
  const sort = parsePrarastiSort(sp.sort);
  const requestedPageIndex0 = parsePageIndex0(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const lostCutoff = calendarDateMonthsAgo(months);

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Prarasti klientai" />
        <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </CrmTableContainer>
    );
  }

  const { count: totalCountRaw, error: countError } = await supabase
    .from("v_client_list_from_invoices")
    .select("*", { count: "exact", head: true })
    .lt("last_invoice_date", lostCutoff);

  if (countError) {
    console.error(LOG, { step: "count", message: countError.message });
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Prarasti klientai" />
        <p className="mt-4 text-sm text-red-600">Nepavyko skaičiuoti: {countError.message}</p>
      </CrmTableContainer>
    );
  }

  const totalCount = totalCountRaw ?? 0;
  const totalPages = totalPagesFromCount(totalCount, pageSize);
  const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

  if (requestedPageIndex0 !== pageIndex0) {
    redirect(`/analitika/prarasti?${prarastiSearchQuery(months, pageSize, pageIndex0, sort)}`);
  }

  const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);
  const from = pageIndex0 * pageSize;
  const to = from + pageSize - 1;

  let rowQuery = supabase
    .from("v_client_list_from_invoices")
    .select(
      "client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue"
    )
    .lt("last_invoice_date", lostCutoff);

  if (sort === "revenue") {
    rowQuery = rowQuery
      .order("total_revenue", { ascending: false })
      .order("last_invoice_date", { ascending: false });
  } else {
    rowQuery = rowQuery
      .order("last_invoice_date", { ascending: false })
      .order("total_revenue", { ascending: false });
  }

  const { data, error } = await rowQuery.range(from, to);

  if (error) {
    console.error(LOG, { step: "rows", message: error.message });
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Prarasti klientai" />
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti: {error.message}</p>
      </CrmTableContainer>
    );
  }

  const rows = (data ?? []).map((r) => mapRawToClientListRow(r));

  return (
    <CrmTableContainer>
      <CrmListPageIntro
        title="Prarasti klientai"
        description={
          <>
            Paskutinė sąskaita senesnė nei <span className="font-medium text-zinc-800">{formatDate(lostCutoff)}</span>{" "}
            (griežtai ankstesnė už
            ribą). Šaltinis: <code className="rounded bg-zinc-100 px-1 text-xs">last_invoice_date</code> iš to paties vaizdo.
          </>
        }
      />

      <CrmListPageControls>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Neaktyvumas nuo:</span>
            {LOST_PRESET_MONTHS.map((m) => {
              const active = m === months;
              const href = `/analitika/prarasti?${prarastiSearchQuery(m, pageSize, 0, sort)}`;
              return active ? (
                <span
                  key={m}
                  className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white"
                >
                  {m} mėn.{m === DEFAULT_LOST_MONTHS ? " (numatytasis)" : ""}
                </span>
              ) : (
                <Link
                  key={m}
                  href={href}
                  className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {m} mėn.
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
            <span className="text-zinc-500">Rikiuoti:</span>
            {sort === "last_invoice_date" ? (
              <span className="font-medium text-zinc-900">Naujausias neaktyvumas</span>
            ) : (
              <Link
                className="cursor-pointer rounded-sm px-0.5 hover:bg-zinc-50 hover:text-zinc-900 hover:underline"
                href={`/analitika/prarasti?${prarastiSearchQuery(months, pageSize, 0, "last_invoice_date")}`}
              >
                Naujausias neaktyvumas
              </Link>
            )}
            <span className="text-zinc-300">·</span>
            {sort === "revenue" ? (
              <span className="font-medium text-zinc-900">Didžiausia apyvarta</span>
            ) : (
              <Link
                className="cursor-pointer rounded-sm px-0.5 hover:bg-zinc-50 hover:text-zinc-900 hover:underline"
                href={`/analitika/prarasti?${prarastiSearchQuery(months, pageSize, 0, "revenue")}`}
              >
                Didžiausia apyvarta
              </Link>
            )}
          </div>
        </div>
      </CrmListPageControls>

      <CrmListPageMain>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <AnalyticsClientTable rows={rows} showInactivity />
          <TablePagination
            basePath="/analitika/prarasti"
            pageIndex0={pageIndex0}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            showingFrom={showingFrom}
            showingTo={showingTo}
            extraQuery={{
              months: String(months),
              ...(sort === "revenue" ? { sort: "revenue" } : {}),
            }}
            ariaLabel="Prarastų klientų puslapiai"
          />
        </div>
      </CrmListPageMain>
    </CrmTableContainer>
  );
}
