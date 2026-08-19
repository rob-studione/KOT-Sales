import { NextResponse, type NextRequest } from "next/server";
import { mergeTemplateContent } from "@/lib/commercialProposal/content";
import { generateTemplatePreviewPdfBytes } from "@/lib/crm/commercialProposalActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { content?: unknown } | null;
    const content = body?.content ? mergeTemplateContent(body.content) : undefined;
    const { bytes, warnings } = await generateTemplatePreviewPdfBytes(content);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="commercial-proposal-template-preview.pdf"`,
        "Cache-Control": "no-store",
        "X-CP-Warnings": encodeURIComponent(JSON.stringify(warnings)),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nepavyko paruošti šablono preview.";
    const status = msg.toLowerCase().includes("not authorized") ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
