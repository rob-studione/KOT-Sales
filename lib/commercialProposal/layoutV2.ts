import { COLOR } from "@/lib/commercialProposal/layout";

export const V2_HEADER = {
  x: 50.25,
  baselineTop: 19.1,
  size: 9,
  color: COLOR.headerGray,
};

export const V2_COVER_TITLE = {
  x: 45,
  firstBaselineTop: 268,
  size: 36,
  lineHeight: 45,
  width: 360,
  maxHeight: 100,
  minSize: 22,
  color: COLOR.green,
};

export type V2Box = {
  x: number;
  yTop: number;
  width: number;
  height: number;
  size: number;
  minSize: number;
  lineHeight: number;
  weight: "regular" | "bold";
  color: { r: number; g: number; b: number };
  align?: "left" | "center";
};

export const V2_TECH_BLOCKS: V2Box[] = [
  { x: 315.86, yTop: 137.57, width: 240, height: 78, size: 15, minSize: 11, lineHeight: 18, weight: "bold", color: COLOR.green },
  { x: 315.86, yTop: 163.46, width: 240, height: 54, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  { x: 37.31, yTop: 352.16, width: 270, height: 24, size: 15, minSize: 11, lineHeight: 18, weight: "bold", color: COLOR.green },
  { x: 37.31, yTop: 378, width: 275, height: 62, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  { x: 37.5, yTop: 568, width: 168, height: 22, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green, align: "center" },
  { x: 37.5, yTop: 593, width: 168, height: 52, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: { r: 74 / 255, g: 74 / 255, b: 74 / 255 }, align: "center" },
  { x: 222, yTop: 568, width: 168, height: 22, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green, align: "center" },
  { x: 222, yTop: 593, width: 168, height: 52, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: { r: 74 / 255, g: 74 / 255, b: 74 / 255 }, align: "center" },
  { x: 410, yTop: 568, width: 168, height: 22, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green, align: "center" },
  { x: 410, yTop: 593, width: 168, height: 52, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: { r: 74 / 255, g: 74 / 255, b: 74 / 255 }, align: "center" },
];

/** uniqueness: left column 4 + 24/7, right column 5 */
export const V2_UNIQUE_BLOCKS: Array<{ title: V2Box; body: V2Box }> = [
  {
    title: { x: 102.17, yTop: 134.2, width: 165, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 102.17, yTop: 154.87, width: 165, height: 40, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 100.51, yTop: 208.49, width: 190, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 100.51, yTop: 229.15, width: 190, height: 50, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 102.2, yTop: 295.49, width: 165, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 102.2, yTop: 317.67, width: 165, height: 36, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 99.98, yTop: 367.49, width: 180, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 99.98, yTop: 389.67, width: 180, height: 50, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 101.79, yTop: 457, width: 165, height: 22, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 101.79, yTop: 479.69, width: 170, height: 36, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 388.49, yTop: 133.67, width: 175, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 388.49, yTop: 154.72, width: 175, height: 40, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 389.98, yTop: 207.96, width: 165, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 389.98, yTop: 228.63, width: 165, height: 36, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 391.49, yTop: 277.67, width: 165, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 391.49, yTop: 298.34, width: 165, height: 36, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 388.15, yTop: 349.54, width: 180, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 388.15, yTop: 371.72, width: 180, height: 36, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    title: { x: 389.08, yTop: 423.83, width: 160, height: 20, size: 15, minSize: 11, lineHeight: 17, weight: "regular", color: COLOR.green },
    body: { x: 389.08, yTop: 446.01, width: 160, height: 36, size: 11.25, minSize: 8, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
];

export const V2_QUALITY_STEPS: Array<{ num: V2Box; title: V2Box; body: V2Box }> = [
  {
    num: { x: 47.9, yTop: 120.84, width: 22, height: 34, size: 30, minSize: 22, lineHeight: 32, weight: "bold", color: COLOR.green },
    title: { x: 94.51, yTop: 119.42, width: 430, height: 20, size: 15, minSize: 12, lineHeight: 17, weight: "bold", color: COLOR.black },
    body: { x: 94.51, yTop: 137.8, width: 470, height: 52, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    num: { x: 47.67, yTop: 210.09, width: 22, height: 34, size: 30, minSize: 22, lineHeight: 32, weight: "bold", color: COLOR.green },
    title: { x: 94.04, yTop: 206.41, width: 430, height: 20, size: 15, minSize: 12, lineHeight: 17, weight: "bold", color: COLOR.black },
    body: { x: 94.04, yTop: 227.05, width: 480, height: 54, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    num: { x: 47.34, yTop: 298.59, width: 22, height: 34, size: 30, minSize: 22, lineHeight: 32, weight: "bold", color: COLOR.green },
    title: { x: 93.39, yTop: 297.17, width: 430, height: 20, size: 15, minSize: 12, lineHeight: 17, weight: "bold", color: COLOR.black },
    body: { x: 93.39, yTop: 315.55, width: 470, height: 36, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    num: { x: 46.95, yTop: 370.59, width: 22, height: 34, size: 30, minSize: 22, lineHeight: 32, weight: "bold", color: COLOR.green },
    title: { x: 92.58, yTop: 366.91, width: 430, height: 20, size: 15, minSize: 12, lineHeight: 17, weight: "bold", color: COLOR.black },
    body: { x: 92.5, yTop: 387.74, width: 470, height: 36, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    num: { x: 46.58, yTop: 442.59, width: 22, height: 34, size: 30, minSize: 22, lineHeight: 32, weight: "bold", color: COLOR.green },
    title: { x: 91.85, yTop: 438.91, width: 430, height: 20, size: 15, minSize: 12, lineHeight: 17, weight: "bold", color: COLOR.black },
    body: { x: 91.85, yTop: 459.55, width: 470, height: 28, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
  {
    num: { x: 46.03, yTop: 499.59, width: 22, height: 34, size: 30, minSize: 22, lineHeight: 32, weight: "bold", color: COLOR.green },
    title: { x: 90.76, yTop: 498.17, width: 430, height: 20, size: 15, minSize: 12, lineHeight: 17, weight: "bold", color: COLOR.black },
    body: { x: 90.76, yTop: 518.07, width: 470, height: 28, size: 11.25, minSize: 8.5, lineHeight: 16.75, weight: "regular", color: COLOR.black },
  },
];
