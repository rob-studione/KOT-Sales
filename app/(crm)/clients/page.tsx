import Link from "next/link";
import { redirect } from "next/navigation";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientsExpandableTable, type ClientListRow } from "@/components/crm/ClientsExpandableTable";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { TablePagination } from "@/components/crm/TablePagination";
import {
  clampPageIndex0,
  parsePageIndex0,
  parsePageSize,
  showingRange1Based,
  totalPagesFromCount,
} from "@/lib/crm/pagination";
import { sanitizeForPostgrestOrClause } from "@/lib/crm/postgrestSearch";
import { formatDate } from "@/lib/crm/format";
import {
  ACTIVE_WINDOW_MONTHS,
  DEFAULT_LOST_MONTHS,
  calendarDateMonthsAgo,
} from "@/lib/crm/analyticsDates";

type DashboardRow = {
  client_count: number | string | null;
};

/* Server component: early returns po async užklausų; JSX čia ne „render“ klaidos. */
/* eslint-disable react-hooks/error-boundaries */

type SortOption = "revenue" | "last_invoice_date";

export const dynamic = "force-dynamic";

const LOG = "[crm/clients]";

function toSafeNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function logDebug(payload: Record<string, unknown>) {
  if (process.env.CRM_DEBUG_QUERIES === "1") {
    console.error(LOG, payload);
  }
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const qRaw = sp.q;
  const qTrim = typeof qRaw === "string" ? qRaw.trim() : "";
  const q = sanitizeForPostgrestOrClause(qTrim);

  const sortRaw = sp.sort;
  const sort: SortOption = sortRaw === "last_invoice_date" ? "last_invoice_date" : "revenue";

  const requestedPageIndex0 = parsePageIndex0(sp.page);
  const pageSize = parsePageSize(sp.pageSize);

  try {
    let supabase;
    try {
      supabase = createSupabaseServerClient();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Nežinoma klaida";
      console.error(LOG, { step: "supabase_init", error: message });
      return (
        <CrmTableContainer>
          <CrmListPageIntro title="Visi klientai" />
          <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
        </CrmTableContainer>
      );
    }

    const activeCutoff = calendarDateMonthsAgo(ACTIVE_WINDOW_MONTHS);
    const lostCutoff = calendarDateMonthsAgo(DEFAULT_LOST_MONTHS);

    let countQuery = supabase.from("v_client_list_from_invoices").select("*", { count: "exact", head: true });

    if (q) {
      countQuery = countQuery.or(`company_name.ilike.%${q}%,company_code.ilike.%${q}%,vat_code.ilike.%${q}%`);
    }

    logDebug({ step: "count_query_start", hasSearch: Boolean(q) });
    const [dashRes, activeRes, lostRes, countResult] = await Promise.all([
      supabase.rpc("dashboard_stats_from_invoices"),
      supabase
        .from("v_client_list_from_invoices")
        .select("*", { count: "exact", head: true })
        .gte("last_invoice_date", activeCutoff),
      supabase
        .from("v_client_list_from_invoices")
        .select("*", { count: "exact", head: true })
        .lt("last_invoice_date", lostCutoff),
      countQuery,
    ]);

    const { count: totalCountRaw, error: countError } = countResult;

    if (dashRes.error) {
      console.error(LOG, {
        step: "dashboard_rpc",
        code: dashRes.error.code,
        message: dashRes.error.message,
      });
      return (
        <CrmTableContainer>
          <CrmListPageIntro title="Visi klientai" />
          <p className="mt-4 text-sm text-red-600">Nepavyko įkelti suvestinės: {dashRes.error.message}</p>
        </CrmTableContainer>
      );
    }

    if (countError) {
      console.error(LOG, {
        step: "count_query",
        code: countError.code,
        message: countError.message,
        details: countError.details,
        hint: countError.hint,
      });
      return (
        <CrmTableContainer>
          <CrmListPageIntro title="Visi klientai" />
          <p className="mt-4 text-sm text-red-600">Nepavyko įkelti klientų: {countError.message}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Jei klaida apie stulpelį <code className="rounded bg-zinc-100 px-1">client_key</code> ar vaizdą, pritaikykite migracijas{" "}
            <code className="rounded bg-zinc-100 px-1">0006_clients_from_invoices_view.sql</code> ir{" "}
            <code className="rounded bg-zinc-100 px-1">0009_company_code_nullable.sql</code> (eilės tvarka) Supabase.
          </p>
        </CrmTableContainer>
      );
    }

    const dashRow = ((dashRes.data ?? [])[0] ?? null) as DashboardRow | null;
    const clientKpiCount = dashRow ? Number(dashRow.client_count ?? 0) : 0;
    const activeCount = activeRes.error ? null : (activeRes.count ?? 0);
    const lostCount = lostRes.error ? null : (lostRes.count ?? 0);

    const totalCount = totalCountRaw ?? 0;
    const totalPages = totalPagesFromCount(totalCount, pageSize);
    const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

    if (requestedPageIndex0 !== pageIndex0) {
      const rp = new URLSearchParams();
      if (qTrim) rp.set("q", qTrim);
      rp.set("sort", sort);
      rp.set("page", String(pageIndex0));
      rp.set("pageSize", String(pageSize));
      redirect(`/clients?${rp.toString()}`);
    }

    const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);
    const from = pageIndex0 * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from("v_client_list_from_invoices").select(`
    client_key,
    company_code,
    client_id,
    company_name,
    vat_code,
    address,
    email,
    phone,
    last_invoice_date,
    invoice_count,
    total_revenue
  `);

    if (q) {
      query = query.or(`company_name.ilike.%${q}%,company_code.ilike.%${q}%,vat_code.ilike.%${q}%`);
    }

    if (sort === "last_invoice_date") {
      query = query.order("last_invoice_date", { ascending: false }).order("total_revenue", { ascending: false });
    } else {
      query = query.order("total_revenue", { ascending: false }).order("last_invoice_date", { ascending: false });
    }

    logDebug({ step: "rows_query_start", from, to, pageIndex0 });
    const { data, error } = await query.range(from, to);

    if (error) {
      console.error(LOG, {
        step: "rows_query",
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return (
        <CrmTableContainer>
          <CrmListPageIntro title="Visi klientai" />
          <p className="mt-4 text-sm text-red-600">Nepavyko įkelti klientų: {error.message}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Jei klaida apie stulpelį <code className="rounded bg-zinc-100 px-1">client_key</code>, pritaikykite migraciją{" "}
            <code className="rounded bg-zinc-100 px-1">0009_company_code_nullable.sql</code> Supabase.
          </p>
        </CrmTableContainer>
      );
    }

    const rawRows =
      data ??
      ([] as Array<{
        client_key: string | null;
        company_code: string | null;
        client_id: string | null;
        company_name: string | null;
        vat_code: string | null;
        address: string | null;
        email: string | null;
        phone: string | null;
        last_invoice_date: string | null;
        invoice_count: number | string | bigint | null;
        total_revenue: string | number | null;
      }>);

    const rows: ClientListRow[] = rawRows.map((r) => ({
      ...r,
      client_key: r.client_key == null ? "" : String(r.client_key),
      invoice_count: toSafeNumber(r.invoice_count),
    }));

    const params = new URLSearchParams();
    if (qTrim) params.set("q", qTrim);
    params.set("sort", sort);

    const revenueHref = `/clients?${(() => {
      const p = new URLSearchParams(params);
      p.set("sort", "revenue");
      p.set("page", "0");
      p.set("pageSize", String(pageSize));
      return p.toString();
    })()}`;
    const dateHref = `/clients?${(() => {
      const p = new URLSearchParams(params);
      p.set("sort", "last_invoice_date");
      p.set("page", "0");
      p.set("pageSize", String(pageSize));
      return p.toString();
    })()}`;

    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Visi klientai" description="Iš sąskaitų suvestinė (Saskaita123 duomenys)." />
        <CrmListPageControls>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
              <span className="text-zinc-500">Rikiuoti:</span>
              {sort === "revenue" ? (
                <span className="font-medium text-zinc-900">Apyvarta</span>
              ) : (
                <Link className="cursor-pointer rounded-sm px-0.5 hover:bg-zinc-50 hover:text-zinc-900 hover:underline" href={revenueHref}>
                  Apyvarta
                </Link>
              )}
              <span className="text-zinc-300">·</span>
              {sort === "last_invoice_date" ? (
                <span className="font-medium text-zinc-900">Paskutinė sąskaita</span>
              ) : (
                <Link className="cursor-pointer rounded-sm px-0.5 hover:bg-zinc-50 hover:text-zinc-900 hover:underline" href={dateHref}>
                  Paskutinė sąskaita
                </Link>
              )}
            </div>
            <div className="flex shrink-0 justify-end sm:min-w-[min(100%,20.5rem)]">
              <ListPageSearchForm
                action="/clients"
                inputId="clients-q"
                defaultQuery={qTrim}
                hiddenFields={{
                  sort,
                  page: "0",
                  pageSize: String(pageSize),
                }}
              />
            </div>
          </div>
        </CrmListPageControls>

        <CrmListPageMain>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
              <div className="text-xs font-medium text-zinc-500">Klientų skaičius</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{clientKpiCount}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
              <div className="text-xs font-medium text-zinc-500">Aktyvūs ({ACTIVE_WINDOW_MONTHS} mėn.)</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
                {activeRes.error ? "—" : activeCount}
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">Paskutinė sąskaita ≥ {formatDate(activeCutoff)}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
              <div className="text-xs font-medium text-zinc-500">Prarasti ({DEFAULT_LOST_MONTHS} mėn.)</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
                {lostRes.error ? "—" : lostCount}
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">Paskutinė sąskaita &lt; {formatDate(lostCutoff)}</div>
            </div>
          </div>

          {(activeRes.error || lostRes.error) && (
            <p className="mb-4 text-xs text-amber-700">
              Dalies skaitiklių nepavyko įkelti. Patikrinkite vaizdą{" "}
              <code className="rounded bg-zinc-100 px-1">v_client_list_from_invoices</code>.
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <ClientsExpandableTable rows={rows} />
            <TablePagination
              basePath="/clients"
              pageIndex0={pageIndex0}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              showingFrom={showingFrom}
              showingTo={showingTo}
              extraQuery={{
                ...(qTrim ? { q: qTrim } : {}),
                sort,
              }}
              ariaLabel="Klientų sąrašo puslapiai"
            />
          </div>
        </CrmListPageMain>
      </CrmTableContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(LOG, { step: "unhandled", message, stack });
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Visi klientai" />
        <p className="mt-4 text-sm text-red-600">Nenumatyta klaida: {message}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Žurnalas: ieškokite <code className="rounded bg-zinc-100 px-1">{LOG}</code> serveryje.
        </p>
      </CrmTableContainer>
    );
  }
}
