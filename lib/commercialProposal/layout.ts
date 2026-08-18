export const PAGE_W = 612;
export const PAGE_H = 792;

export const COLOR = {
  teal: { r: 52 / 255, g: 109 / 255, b: 128 / 255 },
  green: { r: 94 / 255, g: 187 / 255, b: 149 / 255 },
  headerGray: { r: 177 / 255, g: 177 / 255, b: 177 / 255 },
  jobGray: { r: 130 / 255, g: 130 / 255, b: 130 / 255 },
  black: { r: 0, g: 0, b: 0 },
  white: { r: 1, g: 1, b: 1 },
  tableHeader: { r: 238 / 255, g: 238 / 255, b: 238 / 255 },
  tableBorder: { r: 212 / 255, g: 212 / 255, b: 212 / 255 },
} as const;

/** pymupdf top-origin → pdf-lib bottom-origin */
export function yBottom(topY: number): number {
  return PAGE_H - topY;
}

export const COVER = {
  leftX: 45,
  rightX: 321,
  labelBaselineTop: 395,
  nameBaselineTop: 425,
  companyBaselineTop: 445,
  overlayTop: 378,
  overlayBottom: 458,
  overlayLeft: 40,
  overlayRight: 575,
  fontSize: 11.25,
};

export const INTRO = {
  nameX: 152.51,
  nameBaselineTop: 273.24,
  titleBaselineTop: 289.74,
  nameSize: 11.25,
  titleSize: 10.5,
  photo: { x: 37.5, yTop: 261.31, w: 95.25, h: 92.87, overlayRadius: 40 },
};

export const HISTORY = {
  titleBaselineTop: 70.75,
  firstBaselineTop: 109,
  leftX: 37.5,
  maxWidthFull: 537,
  maxWidthBesideArt: 350,
  artBottomTop: 286,
  pageBottomLimitTop: 720,
  lineHeight: 16.75,
  entryGap: 16.5,
  bodySize: 11.25,
};

export const LANG_TABLE = {
  x: 37.5,
  right: 574.5,
  colNrRight: 81.0,
  colLangRight: 413.2,
  headerH: 45,
  rowH: 27.8,
  firstPageTop: 256.7,
  contPageTop: 49.0,
  firstPageRows: 15,
  contPageRows: 19,
  headerLine1TopOffset: 8,
  headerLine2TopOffset: 24.4,
  cellPadX: 6,
  fontSize: 11.25,
};

export const EXTRA_TABLE = {
  x: 37.5,
  right: 574.5,
  colNrRight: 96.0,
  colNameRight: 395.3,
  headerH: 28.5,
  rowH: 27.8,
  firstPageTop: 124.7,
  firstPageRows: 15,
  fontSize: 11.25,
};

export const ISSUER_COMPANY = "Vertimų karaliai, UAB";

export const STATIC_INTRO_PARAGRAPHS = [
  "Ačiū už galimybę pristatyti mūsų vertimo paslaugų kainyną. Žemiau pateiktuose puslapiuose rasite mūsų teikiamų paslaugų įkainius ir kitą svarbią informaciją.",
  "Jeigu kiltų klausimų, ar norėtumėte suplanuoti susitikimą, maloniai prašome informuoti bet kuriuo metu.",
];

export const STANDARD_PAGE_NOTE =
  "Standartinį puslapį sudaro 1700 spaudos ženklų be tarpų.";
