import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { fontsDir } from "@/lib/commercialProposal/paths";

export type CpFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
};

const SYSTEM_ARIAL = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
];

function readFontBytes(fileName: string, systemPath: string): Uint8Array {
  try {
    return new Uint8Array(readFileSync(path.join(fontsDir(), fileName)));
  } catch {
    return new Uint8Array(readFileSync(systemPath));
  }
}

export async function embedProposalFonts(doc: PDFDocument): Promise<CpFonts> {
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(readFontBytes("LiberationSans-Regular.ttf", SYSTEM_ARIAL[0]!));
  const bold = await doc.embedFont(readFontBytes("LiberationSans-Bold.ttf", SYSTEM_ARIAL[1]!));
  const italic = await doc.embedFont(readFontBytes("LiberationSans-Italic.ttf", SYSTEM_ARIAL[2]!));
  return { regular, bold, italic };
}
