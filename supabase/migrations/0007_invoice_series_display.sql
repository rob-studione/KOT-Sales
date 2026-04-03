-- Human-facing invoice number from Invoice123 list payload (OpenAPI: series_title, series_number).

alter table public.invoices
  add column if not exists series_title text null,
  add column if not exists series_number integer null;
