import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/crm/format";

export const dynamic = "force-dynamic";

type DashboardRow = {
  client_count: number | string | null;
  invoice_count: number | string | null;
  total_revenue: string | number | null;
  last_invoice_date: string | null;
};

export default async function ApzvalgaPage() {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-zinc-900">Apžvalga</h1>
        <p className="mt-4 text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </div>
    );
  }

  const { data: dashData, error: dashError } = await supabase.rpc("dashboard_stats_from_invoices");

  if (dashError) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-zinc-900">Apžvalga</h1>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti suvestinės: {dashError.message}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Pritaikykite migraciją <code className="rounded bg-zinc-100 px-1">0006_clients_from_invoices_view.sql</code>{" "}
          arba naudokite atnaujintą schemą.
        </p>
      </div>
    );
  }

  const row = ((dashData ?? [])[0] ?? null) as DashboardRow | null;

  const clientCount = row ? Number(row.client_count ?? 0) : 0;
  const invoiceCount = row ? Number(row.invoice_count ?? 0) : 0;
  const totalRevenue = row?.total_revenue ?? 0;
  const latestInvoiceDate = row?.last_invoice_date ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-zinc-900">Apžvalga</h1>
      <p className="mt-1 text-sm text-zinc-600">Trumpa suvestinė (iš sąskaitų)</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-500">Klientų skaičius</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{clientCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-500">Sąskaitų skaičius</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{invoiceCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-500">Bendra apyvarta</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">{formatMoney(totalRevenue)}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-500">Paskutinė sąskaita</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">{formatDate(latestInvoiceDate)}</div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link
          href="/clients"
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Klientai
        </Link>
        <Link
          href="/invoices"
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Sąskaitos
        </Link>
      </div>
    </div>
  );
}
