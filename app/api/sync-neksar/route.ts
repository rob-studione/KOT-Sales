import { NextResponse } from "next/server";
import { asNumber, asString } from "@/lib/neksar/client-invoices";
import { syncNeksarInvoices } from "@/lib/neksar/syncInvoices";

/**
 * Manual / internal Neksar sync entrypoint.
 * Body: { updatedSince?, issuedFrom?, statuses?, maxPages?, dryRun? }
 */
export async function POST(request: Request) {
  const secret = process.env.NEKSAR_SYNC_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const headerSecret = request.headers.get("x-neksar-secret");
    if (bearer !== secret && headerSecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    updatedSince?: unknown;
    issuedFrom?: unknown;
    statuses?: unknown;
    maxPages?: unknown;
    dryRun?: unknown;
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }

  const result = await syncNeksarInvoices({
    updatedSince: asString(body.updatedSince),
    issuedFrom: asString(body.issuedFrom),
    statuses: asString(body.statuses),
    maxPages: asNumber(body.maxPages),
    dryRun: body.dryRun === true,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.httpStatus });
  }
  return NextResponse.json(result);
}
