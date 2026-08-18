import { NextResponse, type NextRequest } from "next/server";
import { generateProposalPdfBytes } from "@/lib/crm/commercialProposalActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const bytes = await generateProposalPdfBytes(id);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="commercial-proposal-preview.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nepavyko paruošti preview.";
    const status = msg.toLowerCase().includes("not authorized") ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
