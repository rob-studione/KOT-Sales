/** Bendras apatinės linijos skirtukų stilius (Analitika, projektų tabai ir kt.). */
export const CRM_UNDERLINE_TAB_NAV_CLASS = "flex flex-wrap gap-x-1 border-b border-gray-200";

export function crmUnderlineTabClass(active: boolean): string {
  const base =
    "-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center border-b-2 px-4 text-sm font-medium transition-colors";
  return active
    ? `${base} border-gray-900 text-gray-900`
    : `${base} border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900`;
}
