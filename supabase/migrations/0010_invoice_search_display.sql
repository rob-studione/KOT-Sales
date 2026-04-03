-- Generated column for ILIKE search across invoice display number (series_title + series_number) without client-side concat.

alter table public.invoices
  add column if not exists invoice_search_display text
  generated always as (
    trim(coalesce(series_title, '') || ' ' || coalesce(series_number::text, ''))
  ) stored;
