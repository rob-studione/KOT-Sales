import Link from "next/link";
import { redirect } from "next/navigation";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientsExpandableTable, type ClientListRow } from "@/components/crm/ClientsExpandableTable";
import { KlientaiSubNav } from "@/components/crm/KlientaiSubNav";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { TablePagination } from "@/components/crm/TablePagination";
import { clampPageIndex0, parsePageIndex0, parsePageSize, showingRange1Based, totalPagesFromCount } from "@/lib/crm/pagination";
import { buildClientListSearchOrClause } from "@/lib/crm/postgrestSearch";
import { formatDate } from "@/lib/crm/format";
import { ACTIVE_WINDOW_MONTHS, DEFAULT_LOST_MONTHS, LOST_PRESET_MONTHS, calendarDateMonthsAgo, parseLostMonthsParam } from "@/lib/crm/analyticsDates";
import { AnalyticsClientTable } from "@/components/crm/AnalyticsClientTable";
import { mapRawToClientListRow } from "@/lib/crm/mapClientViewRow";

type DashboardRow = {
  client_count: number | string | null;
};

/* Server component: early returns po async užklausų; JSX čia ne „render“ klaidos. */
/* eslint-disable react-hooks/error-boundaries */

type SortOption = "revenue" | "last_invoice_date";
type ClientsView = "all" | "active" | "lost";
type LostSort = "last_invoice_date" | "revenue";

export const dynamic = "force-dynamic";

const LOG = "[crm/klientai]";

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

export default async function KlientaiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const viewRaw = typeof sp.view === "string" ? sp.view : undefined;
  const view: ClientsView = viewRaw === "active" ? "active" : viewRaw === "lost" ? "lost" : "all";

  if (view === "active") {
    return renderActiveClients(sp);
  }
  if (view === "lost") {
    return renderLostClients(sp);
  }

  return renderAllClients(sp);
}

function parseLostSort(raw: unknown): LostSort {
  return raw === "revenue" ? "revenue" : "last_invoice_date";
}

function lostQueryString(args: { months: number; pageSize: number; page: number; sort: LostSort; q?: string }): string {
  const p = new URLSearchParams();
  p.set("view", "lost");
  p.set("months", String(args.months));
  p.set("page", String(args.page));
  p.set("pageSize", String(args.pageSize));
  if (args.sort === "revenue") p.set("sort", "revenue");
  if (args.q) p.set("q", args.q);
  return p.toString();
}

function clientsIntroDescription(view: ClientsView, extras: { activeCutoff?: string; lostCutoff?: string; months?: number }) {
  if (view === "active" && extras.activeCutoff) {
    return (
      <>
        Bent viena sąskaita nuo <span className="font-medium text-zinc-800">{formatDate(extras.activeCutoff)}</span> (įskaitant) —{" "}
        {ACTIVE_WINDOW_MONTHS} mėn. langas.
      </>
    );
  }
  if (view === "lost" && extras.lostCutoff) {
    return (
      <>
        Paskutinė sąskaita senesnė nei <span className="font-medium text-zinc-800">{formatDate(extras.lostCutoff)}</span>.
        {extras.months ? ` (${extras.months} mėn.)` : null}
      </>
    );
  }
  return null;
}

function renderClientsShell(args: {
  view: ClientsView;
  qTrim: string;
  searchHiddenFields: Record<string, string | undefined>;
  toolbarFilters?: React.ReactNode;
  table: React.ReactNode;
  pagination: React.ReactNode;
  footer?: React.ReactNode;
  description?: React.ReactNode;
}) {
  const searchHiddenFields = Object.fromEntries(
    Object.entries(args.searchHiddenFields ?? {}).filter(([, value]) => typeof value === "string")
  ) as Record<string, string>;

  return (
    <CrmTableContainer>
      <CrmListPageMain>
        <CrmListPageIntro title="Klientai" description={args.description} />
        <div className="mt-3">
          <KlientaiSubNav />
        </div>

        <CrmListPageControls>
          <div className="flex flex-col gap-3">
            <ListPageSearchForm
              action="/klientai"
              defaultQuery={args.qTrim}
              placeholder="Paieška (pavadinimas, kodas, PVM, el. paštas)"
              inputId="crm-klientai-search"
              hiddenFields={searchHiddenFields}
            />
            {args.toolbarFilters ? <div>{args.toolbarFilters}</div> : null}
          </div>
        </CrmListPageControls>

        <div className="mt-4">{args.table}</div>
        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">{args.pagination}</div>
        {args.footer ? <div className="mt-6">{args.footer}</div> : null}
      </CrmListPageMain>
    </CrmTableContainer>
  );
}

async function renderAllClients(sp: { [key: string]: string | string[] | undefined }) {
  const qRaw = sp.q;
  const qTrim = typeof qRaw === "string" ? qRaw.trim() : "";
  const q = buildClientListSearchOrClause(qTrim);

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

    const [dashRes] = await Promise.all([
      supabase.from("v_client_list_from_invoices").select("client_count", { head: true, count: "exact" }),
    ]);

    const dashCountRaw = (dashRes as unknown as { count?: number | null })?.count ?? null;
    const dashboard: DashboardRow = { client_count: dashCountRaw };

    let countQuery = supabase.from("v_client_list_from_invoices").select("*", { count: "exact", head: true });
    let dataQuery = supabase
      .from("v_client_list_from_invoices")
      .select(
        "client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue"
      );

    if (q) {
      countQuery = countQuery.or(q);
      dataQuery = dataQuery.or(q);
    }

    if (sort === "last_invoice_date") {
      dataQuery = dataQuery.order("last_invoice_date", { ascending: false, nullsFirst: false });
    } else {
      dataQuery = dataQuery.order("total_revenue", { ascending: false, nullsFirst: false });
    }

    const { count: totalCountRaw, error: countError } = await countQuery;
    if (countError) {
      console.error(LOG, { step: "count", error: countError.message });
      return (
        <CrmTableContainer>
          <CrmListPageIntro title="Visi klientai" />
          <p className="mt-4 text-sm text-red-600">Nepavyko gauti klientų skaičiaus: {countError.message}</p>
        </CrmTableContainer>
      );
    }

    const totalCount = toSafeNumber(totalCountRaw);
    const totalPages = totalPagesFromCount(totalCount, pageSize);
    const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

    if (pageIndex0 !== requestedPageIndex0) {
      const rp = new URLSearchParams();
      if (qTrim) rp.set("q", qTrim);
      rp.set("page", String(pageIndex0));
      rp.set("pageSize", String(pageSize));
      rp.set("sort", sort);
      rp.set("view", "all");
      redirect(`/klientai?${rp.toString()}`);
    }

    const from = pageIndex0 * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await dataQuery.range(from, to);
    if (error) {
      console.error(LOG, { step: "data", error: error.message });
      return (
        <CrmTableContainer>
          <CrmListPageIntro title="Visi klientai" />
          <p className="mt-4 text-sm text-red-600">Nepavyko gauti klientų: {error.message}</p>
        </CrmTableContainer>
      );
    }

    const rows: ClientListRow[] =
      (data ?? []).map((r) => ({
        client_key: String((r as any).client_key ?? ""),
        company_code: String((r as any).company_code ?? ""),
        client_id: String((r as any).client_id ?? ""),
        company_name: String((r as any).company_name ?? ""),
        vat_code: String((r as any).vat_code ?? ""),
        address: String((r as any).address ?? ""),
        email: String((r as any).email ?? ""),
        phone: String((r as any).phone ?? ""),
        last_invoice_date: (r as any).last_invoice_date ? String((r as any).last_invoice_date) : null,
        invoice_count: Number((r as any).invoice_count ?? 0),
        total_revenue: Number((r as any).total_revenue ?? 0),
      })) ?? [];

    const range = showingRange1Based(pageIndex0, pageSize, totalCount);
    return renderClientsShell({
      view: "all",
      qTrim,
      searchHiddenFields: { view: "all", sort },
      table: <ClientsExpandableTable rows={rows} />,
      pagination: (
        <TablePagination
          basePath="/klientai"
          pageIndex0={pageIndex0}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          showingFrom={range.from}
          showingTo={range.to}
          extraQuery={{ view: "all", q: qTrim || undefined, sort }}
          ariaLabel="Klientų puslapiai"
        />
      ),
      footer: (
        <div className="text-xs text-zinc-500">
          Iš viso klientų:{" "}
          <span className="font-medium text-zinc-700">{toSafeNumber(dashboard.client_count).toLocaleString("lt-LT")}</span>
        </div>
      ),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    logDebug({ step: "catch", error: message });
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Klientai" />
        <p className="mt-4 text-sm text-red-600">Klaida: {message}</p>
      </CrmTableContainer>
    );
  }
}

async function renderActiveClients(sp: { [key: string]: string | string[] | undefined }) {
  const qRaw = sp.q;
  const qTrim = typeof qRaw === "string" ? qRaw.trim() : "";
  const q = buildClientListSearchOrClause(qTrim);
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
        <CrmListPageIntro title="Klientai" />
        <div className="mt-3">
          <KlientaiSubNav />
        </div>
        <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </CrmTableContainer>
    );
  }

  let countQuery = supabase
    .from("v_client_list_from_invoices")
    .select("*", { count: "exact", head: true })
    .gte("last_invoice_date", activeCutoff);
  let dataQuery = supabase
    .from("v_client_list_from_invoices")
    .select("client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue")
    .gte("last_invoice_date", activeCutoff);
  if (q) {
    countQuery = countQuery.or(q);
    dataQuery = dataQuery.or(q);
  }

  const { count: totalCountRaw, error: countError } = await countQuery;

  if (countError) {
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Klientai" />
        <div className="mt-3">
          <KlientaiSubNav />
        </div>
        <p className="mt-4 text-sm text-red-600">Nepavyko skaičiuoti: {countError.message}</p>
      </CrmTableContainer>
    );
  }

  const totalCount = totalCountRaw ?? 0;
  const totalPages = totalPagesFromCount(totalCount, pageSize);
  const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

  if (requestedPageIndex0 !== pageIndex0) {
    const rp = new URLSearchParams();
    rp.set("view", "active");
    if (qTrim) rp.set("q", qTrim);
    rp.set("page", String(pageIndex0));
    rp.set("pageSize", String(pageSize));
    redirect(`/klientai?${rp.toString()}`);
  }

  const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);
  const from = pageIndex0 * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await dataQuery
    .order("last_invoice_date", { ascending: false })
    .order("total_revenue", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Klientai" />
        <div className="mt-3">
          <KlientaiSubNav />
        </div>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti: {error.message}</p>
      </CrmTableContainer>
    );
  }

  const rows = (data ?? []).map((r) => mapRawToClientListRow(r));

  return renderClientsShell({
    view: "active",
    qTrim,
    searchHiddenFields: { view: "active" },
    table: <AnalyticsClientTable rows={rows} />,
    pagination: (
      <TablePagination
        basePath="/klientai"
        pageIndex0={pageIndex0}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
        showingFrom={showingFrom}
        showingTo={showingTo}
        extraQuery={{ view: "active", q: qTrim || undefined }}
        ariaLabel="Aktyvių klientų puslapiai"
      />
    ),
    description: clientsIntroDescription("active", { activeCutoff }),
  });
}

async function renderLostClients(sp: { [key: string]: string | string[] | undefined }) {
  const qRaw = sp.q;
  const qTrim = typeof qRaw === "string" ? qRaw.trim() : "";
  const q = buildClientListSearchOrClause(qTrim);
  const months = parseLostMonthsParam(sp.months);
  const sort = parseLostSort(typeof sp.sort === "string" ? sp.sort : undefined);
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
        <CrmListPageIntro title="Klientai" />
        <div className="mt-3">
          <KlientaiSubNav />
        </div>
        <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </CrmTableContainer>
    );
  }

  let countQuery = supabase
    .from("v_client_list_from_invoices")
    .select("*", { count: "exact", head: true })
    .lt("last_invoice_date", lostCutoff);
  let rowQuery = supabase
    .from("v_client_list_from_invoices")
    .select("client_key,company_code,client_id,company_name,vat_code,address,email,phone,last_invoice_date,invoice_count,total_revenue")
    .lt("last_invoice_date", lostCutoff);
  if (q) {
    countQuery = countQuery.or(q);
    rowQuery = rowQuery.or(q);
  }

  const { count: totalCountRaw, error: countError } = await countQuery;

  if (countError) {
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Klientai" />
        <div className="mt-3">
          <KlientaiSubNav />
        </div>
        <p className="mt-4 text-sm text-red-600">Nepavyko skaičiuoti: {countError.message}</p>
      </CrmTableContainer>
    );
  }

  const totalCount = totalCountRaw ?? 0;
  const totalPages = totalPagesFromCount(totalCount, pageSize);
  const pageIndex0 = clampPageIndex0(requestedPageIndex0, totalPages);

  if (requestedPageIndex0 !== pageIndex0) {
    redirect(`/klientai?${lostQueryString({ months, pageSize, page: pageIndex0, sort, q: qTrim || undefined })}`);
  }

  const { from: showingFrom, to: showingTo } = showingRange1Based(pageIndex0, pageSize, totalCount);
  const from = pageIndex0 * pageSize;
  const to = from + pageSize - 1;

  rowQuery =
    sort === "revenue"
      ? rowQuery.order("total_revenue", { ascending: false }).order("last_invoice_date", { ascending: false })
      : rowQuery.order("last_invoice_date", { ascending: false }).order("total_revenue", { ascending: false });

  const { data, error } = await rowQuery.range(from, to);

  if (error) {
    return (
      <CrmTableContainer>
        <CrmListPageIntro title="Klientai" />
        <div className="mt-3">
          <KlientaiSubNav />
        </div>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti: {error.message}</p>
      </CrmTableContainer>
    );
  }

  const rows = (data ?? []).map((r) => mapRawToClientListRow(r));

  const toolbarFilters = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500">Neaktyvumas nuo:</span>
        {LOST_PRESET_MONTHS.map((m) => {
          const active = m === months;
          const href = `/klientai?${lostQueryString({ months: m, pageSize, page: 0, sort, q: qTrim || undefined })}`;
          return active ? (
            <span key={m} className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white">
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
            href={`/klientai?${lostQueryString({ months, pageSize, page: 0, sort: "last_invoice_date", q: qTrim || undefined })}`}
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
            href={`/klientai?${lostQueryString({ months, pageSize, page: 0, sort: "revenue", q: qTrim || undefined })}`}
          >
            Didžiausia apyvarta
          </Link>
        )}
      </div>
    </>
  );

  return renderClientsShell({
    view: "lost",
    qTrim,
    searchHiddenFields: {
      view: "lost",
      months: String(months),
      ...(sort === "revenue" ? { sort: "revenue" } : {}),
    },
    toolbarFilters,
    table: <AnalyticsClientTable rows={rows} showInactivity />,
    pagination: (
      <TablePagination
        basePath="/klientai"
        pageIndex0={pageIndex0}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
        showingFrom={showingFrom}
        showingTo={showingTo}
        extraQuery={{
          view: "lost",
          q: qTrim || undefined,
          months: String(months),
          ...(sort === "revenue" ? { sort: "revenue" } : {}),
        }}
        ariaLabel="Prarastų klientų puslapiai"
      />
    ),
    description: clientsIntroDescription("lost", { lostCutoff, months }),
  });
}

