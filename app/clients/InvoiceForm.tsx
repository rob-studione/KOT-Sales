"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function InvoiceForm() {
  const router = useRouter();

  const [invoiceId, setInvoiceId] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const supabase: SupabaseClient | null = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Supabase is not configured (missing env vars).");
      return;
    }

    if (!invoiceId.trim()) return setError("`invoice_id` is required.");
    if (!companyCode.trim()) return setError("`company_code` is required.");
    if (!invoiceDate) return setError("`invoice_date` is required.");
    if (!amount.trim()) return setError("`amount` is required.");

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum)) return setError("`amount` must be a valid number.");

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from("invoices").insert({
        invoice_id: invoiceId.trim(),
        company_code: companyCode.trim(),
        invoice_date: invoiceDate,
        amount: amountNum,
      });

      if (insertError) throw insertError;

      // Re-fetch the server-rendered table and aggregates (trigger runs on insert).
      router.refresh();

      setInvoiceId("");
      setCompanyCode("");
      setInvoiceDate("");
      setAmount("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to insert invoice.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-4"
      aria-label="Create invoice"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Create invoice</h2>
          <p className="text-sm text-zinc-600">Adds an invoice and updates company totals.</p>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-sm font-medium text-zinc-800" htmlFor="invoice_id">
            invoice_id
          </label>
          <input
            id="invoice_id"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            placeholder="INV-1001"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-800" htmlFor="company_code">
            company_code
          </label>
          <input
            id="company_code"
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value)}
            placeholder="ACME"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-800" htmlFor="invoice_date">
            invoice_date
          </label>
          <input
            id="invoice_date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-800" htmlFor="amount">
            amount
          </label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1234.56"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Create invoice"}
        </button>
      </div>
    </form>
  );
}

