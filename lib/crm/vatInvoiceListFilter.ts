/**
 * Saskaita123 pagrindinio sąskaitų sąrašo atitikmu: tik galutinės PVM sąskaitos.
 * Filtras tik pagal serijos laukus (`series_title` / rodomas numeris su `series_number`), ne pagal vidinį `invoice_id`.
 *
 * - `series_title` turi prasidėti `VK-` — įprastos PVM sąskaitos.
 * - Avansinės sąskaitos, kreditinės ir kiti dokumentai paprastai naudoja kitas serijas (pvz. PA-, KS-…) ir nepatenka.
 * Sinchronas nekeičiamas — DB lieka visi dokumentai; filtras taikomas tik sąrašo užklausoje.
 */
export const VAT_INVOICE_SERIES_TITLE_ILIKE = "VK-%";
