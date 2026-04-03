import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ClientsExpandableTable,
  type ClientListRow,
  type RecentInvoiceRow,
} from "@/components/crm/ClientsExpandableTable";
import { ListPagination } from "@/components/crm/ListPagination";
import { CRM_PAGE_SIZE, parsePage, totalPages } from "@/lib/crm/pagination";
import { sanitizeForPostgrestOrClause } from "@/lib/crm/postgrestSearch";

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

  const pageRaw = sp.page;
  const requestedPage = parsePage(typeof pageRaw === "string" ? pageRaw : undefined);

  try {
    let supabase;
    try {
      supabase = createSupabaseServerClient();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Nežinoma klaida";
      console.error(LOG, { step: "supabase_init", error: message });
      return (
        <div className="mx-auto max-w-5xl">
          <h1 className="text-xl font-semibold">Klientai</h1>
          <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
        </div>
      );
    }

    let countQuery = supabase.from("v_client_list_from_invoices").select("*", { count: "exact", head: true });

    if (q) {
      countQuery = countQuery.or(`company_name.ilike.%${q}%,company_code.ilike.%${q}%,vat_code.ilike.%${q}%`);
    }

    logDebug({ step: "count_query_start", hasSearch: Boolean(q) });
    const { count: totalCountRaw, error: countError } = await countQuery;

    if (countError) {
      console.error(LOG, {
        step: "count_query",
        code: countError.code,
        message: countError.message,
        details: countError.details,
        hint: countError.hint,
      });
      return (
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-semibold">Klientai</h1>
          <p className="mt-4 text-sm text-red-600">Nepavyko įkelti klientų: {countError.message}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Jei klaida apie stulpelį <code className="rounded bg-zinc-100 px-1">client_key</code> ar vaizdą, pritaikykite migracijas{" "}
            <code className="rounded bg-zinc-100 px-1">0006_clients_from_invoices_view.sql</code> ir{" "}
            <code className="rounded bg-zinc-100 px-1">0009_company_code_nullable.sql</code> (eilės tvarka) Supabase.
          </p>
        </div>
      );
    }

    const totalCount = totalCountRaw ?? 0;
    const pages = totalPages(totalCount, CRM_PAGE_SIZE);
    const page = Math.min(requestedPage, pages);
    const from = (page - 1) * CRM_PAGE_SIZE;
    const to = from + CRM_PAGE_SIZE - 1;

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

    logDebug({ step: "rows_query_start", from, to, page });
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
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-semibold">Klientai</h1>
          <p className="mt-4 text-sm text-red-600">Nepavyko įkelti klientų: {error.message}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Jei klaida apie stulpelį <code className="rounded bg-zinc-100 px-1">client_key</code>, pritaikykite migraciją{" "}
            <code className="rounded bg-zinc-100 px-1">0009_company_code_nullable.sql</code> Supabase.
          </p>
        </div>
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

    const clientKeys = rows.map((r) => r.client_key);

    let recentByClientKey: Record<string, RecentInvoiceRow[]> = {};
    if (clientKeys.length > 0) {
      logDebug({ step: "rpc_recent_invoices_for_clients", keyCount: clientKeys.length });
      const { data: recentRows, error: recentError } = await supabase.rpc("recent_invoices_for_clients", {
        p_codes: clientKeys,
      });

      if (recentError) {
        console.error(LOG, {
          step: "rpc_recent_invoices_for_clients",
          code: recentError.code,
          message: recentError.message,
          details: recentError.details,
          hint: recentError.hint,
        });
      }

      if (!recentError && recentRows && Array.isArray(recentRows)) {
        for (const raw of recentRows as Array<Record<string, unknown>>) {
          const k =
            (typeof raw.client_key === "string" && raw.client_key) ||
            (typeof raw.company_code === "string" && raw.company_code) ||
            "";
          if (!k) continue;
          if (!recentByClientKey[k]) recentByClientKey[k] = [];
          recentByClientKey[k].push({
            invoice_id: String(raw.invoice_id ?? ""),
            invoice_date: String(raw.invoice_date ?? ""),
            amount: raw.amount as string | number | null,
          });
        }
      }
    }

    const params = new URLSearchParams();
    if (qTrim) params.set("q", qTrim);
    params.set("sort", sort);

    const revenueHref = `/clients?${(() => {
      const p = new URLSearchParams(params);
      p.set("sort", "revenue");
      return p.toString();
    })()}`;
    const dateHref = `/clients?${(() => {
      const p = new URLSearchParams(params);
      p.set("sort", "last_invoice_date");
      return p.toString();
    })()}`;

    function buildPageHref(p: number) {
      const pms = new URLSearchParams(params);
      if (p > 1) pms.set("page", String(p));
      else pms.delete("page");
      const s = pms.toString();
      return s ? `/clients?${s}` : "/clients";
    }

    return (
      <div className="mx-auto max-w-5xl flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Klientai</h1>
          <p className="text-sm text-zinc-600">Iš sąskaitų suvestinė (Saskaita123 duomenys)</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Paieška ir rikiavimas</h2>
          <p className="mt-0.5 text-sm text-zinc-600">Ieškoti pagal pavadinimą, kodą ar PVM kodą.</p>

          <form method="get" className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-zinc-800" htmlFor="q">
                Paieška
              </label>
              <input
                id="q"
                name="q"
                defaultValue={qTrim}
                placeholder="pvz. UAB, kodas, PVM"
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </div>
            <input type="hidden" name="sort" value={sort} />
            <button
              type="submit"
              className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Ieškoti
            </button>
          </form>

          <div className="mt-3 text-sm text-zinc-700">
            <span className="text-xs text-zinc-500">Rikiuoti:</span>
            <span className="ml-2">
              {sort === "revenue" ? (
                <span className="font-medium text-zinc-900">Apyvarta</span>
              ) : (
                <Link className="hover:underline" href={revenueHref}>
                  Apyvarta
                </Link>
              )}
            </span>
            <span className="ml-3">
              {sort === "last_invoice_date" ? (
                <span className="font-medium text-zinc-900">Paskutinė sąskaita</span>
              ) : (
                <Link className="hover:underline" href={dateHref}>
                  Paskutinė sąskaita
                </Link>
              )}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-end gap-x-2 border-b border-zinc-100 bg-zinc-50 px-2 py-2 text-xs font-medium text-zinc-600 sm:px-3">
            <div>Pavadinimas</div>
            <div className="text-right whitespace-nowrap">Paskutinė sąskaita</div>
            <div className="text-right whitespace-nowrap">Sąskaitų skaičius</div>
            <div className="text-right whitespace-nowrap">Bendra apyvarta</div>
            <div className="text-right text-[0.65rem] uppercase tracking-wide text-zinc-400 sm:text-xs sm:normal-case sm:tracking-normal">
              Veiksmai
            </div>
          </div>
          <ClientsExpandableTable rows={rows} recentByClientKey={recentByClientKey} />
          <ListPagination page={page} totalCount={totalCount} pageSize={CRM_PAGE_SIZE} buildHref={buildPageHref} />
        </div>
      </div>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(LOG, { step: "unhandled", message, stack });
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold">Klientai</h1>
        <p className="mt-4 text-sm text-red-600">Nenumatyta klaida: {message}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Žurnalas: ieškokite <code className="rounded bg-zinc-100 px-1">{LOG}</code> serveryje.
        </p>
      </div>
    );
  }
}
