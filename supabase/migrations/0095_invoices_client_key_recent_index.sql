-- Speed up recent_invoices_for_clients(p_codes):
-- - predicate uses expression client_key = coalesce(nullif(trim(company_code), ''), client_id, '')
-- - needs matching expression index to avoid seq scan + sort per key

create index if not exists invoices_client_key_recent_idx
on public.invoices (
  (coalesce(nullif(trim(company_code), ''), client_id, '')),
  invoice_date desc,
  invoice_id desc
)
include (amount, invoice_number)
where coalesce(nullif(trim(company_code), ''), client_id, '') <> '';

analyze public.invoices;

