import { deflateSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { generateCommercialProposalPdf } from "@/lib/commercialProposal/generatePdf";
import { ISSUER_COMPANY, STANDARD_PAGE_NOTE, STATIC_INTRO_PARAGRAPHS } from "@/lib/commercialProposal/layout";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import { resolveTemplatePdfPath } from "@/lib/commercialProposal/paths";
import type { CommercialProposalSnapshot, CpPriceCategory } from "@/lib/commercialProposal/types";

const TRANSLATION: Array<[string, number, boolean]> = [
  ["Lietuvių ↔ Anglų", 10.8, false],
  ["Lietuvių ↔ Rusų", 10.8, false],
  ["Lietuvių ↔ Vokiečių", 13.5, false],
  ["Lietuvių ↔ Lenkų", 13.5, false],
  ["Lietuvių ↔ Latvių", 15.3, false],
  ["Lietuvių ↔ Estų", 21.6, false],
  ["Lietuvių ↔ Italų", 16.2, false],
  ["Lietuvių ↔ Prancūzų", 16.2, false],
  ["Lietuvių ↔ Ispanų", 16.2, false],
  ["Lietuvių ↔ Baltarusių", 16.2, false],
  ["Lietuvių ↔ Ukrainiečių", 16.2, false],
  ["Lietuvių ↔ Olandų", 16.2, false],
  ["Lietuvių ↔ Norvegų", 17.1, false],
  ["Lietuvių ↔ Švedų", 17.1, false],
  ["Lietuvių ↔ Danų", 16.0, false],
  ["Lietuvių ↔ Graikų", 19.8, false],
  ["Lietuvių ↔ Portugalų", 19.8, false],
  ["Lietuvių ↔ Albanų", 19.8, false],
  ["Lietuvių ↔ Bulgarų", 19.8, false],
  ["Lietuvių ↔ Kroatų", 19.8, false],
  ["Lietuvių ↔ Čekų", 19.8, false],
  ["Lietuvių ↔ Suomių", 19.8, false],
  ["Lietuvių ↔ Gruzinų", 19.8, false],
  ["Lietuvių ↔ Vengrų", 19.8, false],
  ["Lietuvių ↔ Kazachų", 19.8, false],
  ["Lietuvių ↔ Rumunų", 19.8, false],
  ["Lietuvių ↔ Serbų", 19.8, false],
  ["Lietuvių ↔ Turkų", 19.8, false],
  ["Lietuvių ↔ Arabų", 21.6, false],
  ["Lietuvių ↔ Japonų", 21.6, false],
  ["Lietuvių ↔ Kinų", 21.6, false],
  ["Lietuvių ↔ Islandų", 27.0, false],
  ["Lietuvių ↔ Hebrajų", 21.6, false],
  ["Kitos kalbų kombinacijos", 22.5, true],
];

const AI: Array<[string, number, boolean]> = [
  ["Lietuvių ↔ Anglų", 6.48, false],
  ["Lietuvių ↔ Rusų", 6.48, false],
  ["Lietuvių ↔ Vokiečių", 8.1, false],
  ["Lietuvių ↔ Lenkų", 8.1, false],
  ["Lietuvių ↔ Latvių", 9.18, false],
  ["Lietuvių ↔ Estų", 12.96, false],
  ["Lietuvių ↔ Italų", 9.72, false],
  ["Lietuvių ↔ Prancūzų", 9.72, false],
  ["Lietuvių ↔ Ispanų", 9.72, false],
  ["Lietuvių ↔ Baltarusių", 9.72, false],
  ["Lietuvių ↔ Ukrainiečių", 9.72, false],
  ["Lietuvių ↔ Olandų", 9.72, false],
  ["Lietuvių ↔ Norvegų", 10.26, false],
  ["Lietuvių ↔ Švedų", 10.26, false],
  ["Lietuvių ↔ Danų", 9.6, false],
  ["Lietuvių ↔ Graikų", 11.88, false],
  ["Lietuvių ↔ Portugalų", 11.88, false],
  ["Lietuvių ↔ Albanų", 11.88, false],
  ["Lietuvių ↔ Bulgarų", 11.88, false],
  ["Lietuvių ↔ Kroatų", 11.88, false],
  ["Lietuvių ↔ Čekų", 11.88, false],
  ["Lietuvių ↔ Suomių", 11.88, false],
  ["Lietuvių ↔ Gruzinų", 11.88, false],
  ["Lietuvių ↔ Vengrų", 11.88, false],
  ["Lietuvių ↔ Kazachų", 11.88, false],
  ["Lietuvių ↔ Rumunų", 11.88, false],
  ["Lietuvių ↔ Serbų", 11.88, false],
  ["Lietuvių ↔ Turkų", 11.88, false],
  ["Lietuvių ↔ Arabų", 12.96, false],
  ["Lietuvių ↔ Japonų", 12.96, false],
  ["Lietuvių ↔ Kinų", 12.96, false],
  ["Lietuvių ↔ Islandų", 16.2, false],
  ["Lietuvių ↔ Hebrajų", 12.96, false],
  ["Kitos kalbų kombinacijos", 13.5, true],
];

const EXTRA: Array<[string, number | null, boolean, boolean, string | null]> = [
  ["Standartinis maketavimas", null, false, true, null],
  ["Profesionalus maketavimas", 3, true, false, "psl.*"],
  ["Vertimų biuro patvirtinimas", null, false, true, null],
  ["Notarinis patvirtinimas", 16.53, false, false, "dokumentas"],
  ["Apostilė (tvirtinimas pažyma Apostille)", 24.79, false, false, "dokumentas"],
  ["Dokumentų siuntimas registruotu laišku", 4.92, false, false, "vnt."],
  ["Dokumentų pristatymas kurjeriu Lietuvoje", 7.4, false, false, "vnt."],
  ["Dokumentų pristatymas kurjeriu užsienyje", 24, true, false, "vnt."],
  ["Redagavimas", 2.6, true, false, "psl.*"],
  ["Stilistinis / kūrybinis redagavimas", 6, true, false, "psl.*"],
  ["Įgarsinimas", 25, true, false, "100 ž."],
  ["Transkribavimas", 3, true, false, "min."],
  ["Subtitravimas", 12, true, false, "100 ž."],
  ["Nuoseklusis vertimas žodžiu (1 vertėjas)", 65, true, false, "val."],
  ["Sinchroninis vertimas žodžiu (2 vertėjai)", 160, true, false, "val."],
];

const HISTORY: Array<[number, string]> = [
  [2016, "įsikūrėme Lietuvoje siekdami teikti aukštos kokybės vertimo paslaugas per trumpiausią laiką"],
  [2017, "įgijome vienos didžiausių įmonių Lietuvoje pasitikėjimą"],
  [2018, "tapome vienu pagrindinių vertimo paslaugų tiekėjų viešajam sektoriui ir įžengėme į Jungtinės Karalystės rinką"],
  [2019, "tapome ITI asociacijos nariais Jungtinėje Karalystėje"],
  [2020, "sukūrėme unikalią „KoT Cloud“ vertimo paslaugų valdymo sistemą"],
  [2021, "sukūrėme „KoT Editor“ CAT vertimo įrankį savo vertėjams"],
  [2022, "sėkmingai įžengėme į JAV rinką ir tapome ATA (American Translators Association) nariais"],
  [2023, "JAV rinkoje tapome didžiausio vertimų biuro pasaulyje „RWS Group“, kuriam padedame aptarnauti klientą „Apple“ lokalizuodami jų tekstus, vertimo paslaugų tiekėjais"],
  [2024, "JAV buvome atrinkti į „GSA SCHEDULE“ vertimo paslaugų tiekimo sistemą, kurios pagalba galime teikti vertimo paslaugas visoms federalinėms JAV įstaigoms"],
];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function solidPng(r: number, g: number, b: number, size = 128): Uint8Array {
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

function catLines(
  category: CpPriceCategory,
  rows: Array<[string, number, boolean]> | Array<[string, number | null, boolean, boolean, string | null]>
): CommercialProposalSnapshot["lines"] {
  return rows.map((row, i) => {
    const label = row[0];
    const base = row[1];
    const isFrom = row[2];
    const isFree = row.length >= 4 ? Boolean(row[3]) : false;
    const unit = row.length >= 5 ? (row[4] as string | null) : null;
    const calculated = isFree || base == null ? null : applyGlobalDiscount(base, 0);
    return {
      category,
      catalog_item_id: null,
      sort_order: i + 1,
      label,
      base_price: isFree ? null : base,
      calculated_price: calculated,
      final_price: calculated,
      is_manual_override: false,
      is_from_price: isFrom,
      is_free: isFree,
      currency: "EUR",
      unit,
    };
  });
}

export function buildReferenceFixtureSnapshot(opts?: {
  firstName?: string;
  lastName?: string;
  displayName?: string;
}): CommercialProposalSnapshot {
  const first_name = opts?.firstName ?? "Vaidotas";
  const last_name = opts?.lastName ?? "Rimeikis";
  const display_name = opts?.displayName ?? `${first_name} ${last_name}`;
  return {
    template_version: "LT_COMMERCIAL_V1",
    proposal_number: "CP-2026-0001",
    created_at: "2026-08-18T12:00:00.000Z",
    generated_at: "2026-08-18T12:00:00.000Z",
    global_discount_pct: 0,
    client: {
      client_key: "fixture",
      client_id: "fixture",
      company_code: null,
      name: "MOTIEKA IR AUDZEVIČIUS",
    },
    sales_manager: {
      id: "fixture",
      first_name,
      last_name,
      display_name,
      job_title: "Pardavimų vadybininkas",
      email: null,
      phone: null,
      avatar_url: null,
    },
    company_history: HISTORY.map(([year, body], i) => ({ year, body, sort_order: (i + 1) * 10 })),
    lines: [
      ...catLines("translation", TRANSLATION),
      ...catLines("ai_translation", AI),
      ...catLines("additional_service", EXTRA),
    ],
    content: {
      issuer_company: ISSUER_COMPANY,
      intro_paragraphs: [...STATIC_INTRO_PARAGRAPHS],
      standard_page_note: STANDARD_PAGE_NOTE,
    },
  };
}

async function main() {
  const templatePath = resolveTemplatePdfPath("LT_COMMERCIAL_V1");
  if (templatePath.includes("/Downloads/") || templatePath.includes("\\Downloads\\")) {
    throw new Error(`Template must not load from Downloads: ${templatePath}`);
  }

  const outDir = path.join(process.cwd(), "tmp", "cp-ref");
  mkdirSync(outDir, { recursive: true });

  const noAvatar = await generateCommercialProposalPdf({
    snapshot: buildReferenceFixtureSnapshot({
      firstName: "Jonas",
      lastName: "Jonaitis",
      displayName: "Jonas Jonaitis",
    }),
  });
  const noAvatarPath = path.join(outDir, "generated-v1-no-avatar.pdf");
  writeFileSync(noAvatarPath, noAvatar);

  const withAvatar = await generateCommercialProposalPdf({
    snapshot: buildReferenceFixtureSnapshot({
      firstName: "Ieva",
      lastName: "Petraitytė",
      displayName: "Ieva Petraitytė",
    }),
    managerAvatarBytes: solidPng(94, 187, 149),
  });
  const withAvatarPath = path.join(outDir, "generated-v1-with-avatar.pdf");
  writeFileSync(withAvatarPath, withAvatar);

  const visual = await generateCommercialProposalPdf({
    snapshot: buildReferenceFixtureSnapshot(),
  });
  const visualPath = path.join(outDir, "generated-v1.pdf");
  writeFileSync(visualPath, visual);

  console.log("template", templatePath);
  console.log("wrote", noAvatarPath, noAvatar.byteLength);
  console.log("wrote", withAvatarPath, withAvatar.byteLength);
  console.log("wrote", visualPath, visual.byteLength);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
