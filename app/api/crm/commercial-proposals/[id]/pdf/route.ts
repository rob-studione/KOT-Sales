import { NextResponse, type NextRequest } from "next/server";
import { generateProposalPdfBytes, getProposalPdfSignedUrl } from "@/lib/crm/commercialProposalActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const download = req.nextUrl.searchParams.get("download") === "1";
  try {
    const signed = await getProposalPdfSignedUrl(id);
    if (signed && !req.nextUrl.searchParams.get("fresh")) {
      if (download) {
        const bytes = await generateProposalPdfBytes(id);
        return new NextResponse(Buffer.from(bytes), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="commercial-proposal.pdf"`,
            "Cache-Control": "private, max-age=60",
          },
        });
      }
      return NextResponse.redirect(signed);
    }
    const bytes = await generateProposalPdfBytes(id);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="commercial-proposal.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nepavyko gauti PDF.";
    const status = msg.toLowerCase().includes("not authorized") ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
