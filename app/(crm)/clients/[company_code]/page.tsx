import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayClientName, formatCompanyCodeDetail, formatDate, formatMoney } from "@/lib/crm/format";
import { ORPHAN_CLIENT_PATH_SEGMENT } from "@/lib/crm/clientRouting";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ company_code: string }>;
}) {
  const { company_code: companyCodeParam } = await params;
  const segment = decodeURIComponent(companyCodeParam);

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
      <div className="mx-auto max-w-5xl">
        <Link href="/clients" className="text-sm text-zinc-600 hover:underline">
          ← Atgal į klientus
        </Link>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti kliento: {summaryError.message}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="mx-auto max-w-5xl">
        <Link href="/clients" className="text-sm text-zinc-600 hover:underline">
          ← Atgal į klientus
        </Link>
        <p className="mt-4 text-sm text-zinc-600">Klientas nerastas (nėra sąskaitų šiam kodui).</p>
      </div>
    );
  }

  let invQuery = supabase
    .from("invoices")
    .select("invoice_id,invoice_date,amount,created_at")
    .order("invoice_date", { ascending: false })
    .limit(200);

  if (summary.company_code != null && summary.company_code.trim() !== "") {
    invQuery = invQuery.eq("company_code", summary.company_code.trim());
  } else if (summary.client_id != null && summary.client_id.trim() !== "") {
    invQuery = invQuery.eq("client_id", summary.client_id.trim()).is("company_code", null);
  } else {
    invQuery = invQuery.is("company_code", null).is("client_id", null);
  }

  const { data: invoices, error: invoicesError } = await invQuery;

  const displayTitle = displayClientName(summary.company_name, summary.company_code);

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href="/clients" className="text-sm text-zinc-600 hover:underline">
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
                {(invoices ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      Sąskaitų nėra.
                    </td>
                  </tr>
                ) : (
                  (invoices ?? []).map((inv) => (
                    <tr key={inv.invoice_id} className="border-t border-zinc-100">
                      <td className="px-4 py-3 font-medium text-zinc-900">{inv.invoice_id}</td>
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
      </div>
    </div>
  );
}
