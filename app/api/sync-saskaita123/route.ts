import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AnyRecord = Record<string, unknown>;

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickFirst(obj: AnyRecord, keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return undefined;
}

function toISODate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;

  // If already YYYY-MM-DD, keep it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function extractInvoices(payload: unknown): AnyRecord[] {
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === "object") as AnyRecord[];
  if (payload && typeof payload === "object") {
    const obj = payload as AnyRecord;
    const candidates = [
      obj.invoices,
      obj.data,
      obj.items,
      obj.results,
      obj.value,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c.filter((x) => x && typeof x === "object") as AnyRecord[];
    }
  }
  return [];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST() {
  try {
    const apiKey = process.env.SASKAITA123_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing env var SASKAITA123_API_KEY" }, { status: 500 });
    }

    const res = await fetch("https://app.invoice123.com/api/v1.0/invoices", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const json = (await res.json()) as unknown;
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch invoices", status: res.status, body: json },
        { status: 502 }
      );
    }

    const invoices = extractInvoices(json);
    const fetchedCount = invoices.length;

    const rowsValid = invoices
      .map((inv) => {
        const invoiceId =
          asString(pickFirst(inv, ["invoice_id", "invoiceId", "id", "number", "invoiceNumber"]))?.trim() ?? null;

        const companyCode =
          asString(pickFirst(inv, ["company_code", "companyCode", "client_code", "clientCode", "customer_code"]))?.trim() ??
          null;

        const invoiceDate =
          toISODate(pickFirst(inv, ["invoice_date", "invoiceDate", "date", "issued_at", "issuedAt", "issueDate"])) ?? null;

        const amount =
          asNumber(pickFirst(inv, ["amount", "total", "total_amount", "totalAmount", "sum"])) ?? null;

        if (!invoiceId || !companyCode || !invoiceDate || amount === null) return null;

        return {
          invoice_id: invoiceId,
          company_code: companyCode,
          invoice_date: invoiceDate,
          amount,
        };
      })
      .filter((x): x is { invoice_id: string; company_code: string; invoice_date: string; amount: number } => Boolean(x));

    const supabase = createSupabaseServerClient();

    // Skip duplicates based on invoice_id by pre-checking existing rows.
    const invoiceIds = Array.from(new Set(rowsValid.map((r) => r.invoice_id)));
    const existingIds = new Set<string>();

    for (const idsChunk of chunk(invoiceIds, 500)) {
      const { data: existing, error: existingError } = await supabase
        .from("invoices")
        .select("invoice_id")
        .in("invoice_id", idsChunk);
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }
      for (const row of existing ?? []) {
        const id = asString((row as AnyRecord).invoice_id);
        if (id) existingIds.add(id);
      }
    }

    const rowsToInsert = rowsValid.filter((r) => !existingIds.has(r.invoice_id));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("invoices").insert(rowsToInsert);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const insertedCount = rowsToInsert.length;
    const skippedCount = existingIds.size;

    return NextResponse.json({
      fetched: fetchedCount,
      inserted: insertedCount,
      skipped: skippedCount,
      attempted_valid: rowsValid.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

