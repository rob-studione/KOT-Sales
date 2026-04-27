-- The RPC query does not constrain c.k <> ''.
-- A partial index with `... <> ''` predicate cannot be used for a generic plan where c.k is a parameter.
-- Recreate the index as non-partial so the planner can use it in recent_invoices_for_clients() for batches.

drop index if exists public.invoices_client_key_recent_idx;

create index if not exists invoices_client_key_recent_idx
on public.invoices (
  (coalesce(nullif(trim(company_code), ''), client_id, '')),
  invoice_date desc,
  invoice_id desc
)
include (amount, invoice_number);

analyze public.invoices;

