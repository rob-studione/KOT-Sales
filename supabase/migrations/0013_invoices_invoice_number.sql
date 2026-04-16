-- Human-facing invoice number (series_title + series_number, else internal id). Sync fills this.
-- Prerequisite: series_title / series_number columns (0007_invoice_series_display.sql).

alter table public.invoices add column if not exists invoice_number text;

update public.invoices
set invoice_number = trim(
  case
    when trim(coalesce(series_title, '')) <> '' and series_number is not null
      then trim(series_title) || ' ' || series_number::text
    when trim(coalesce(series_title, '')) <> ''
      then trim(series_title)
    when series_number is not null
      then series_number::text
    else invoice_id
  end
);

update public.invoices
set invoice_number = invoice_id
where trim(coalesce(invoice_number, '')) = '';

alter table public.invoices alter column invoice_number set not null;

-- Recent invoices RPC: include invoice_number for client expand UI.
create or replace function public.recent_invoices_for_clients(p_codes text[])
returns table (
  client_key text,
  invoice_id text,
  invoice_date date,
  amount numeric,
  invoice_number text
)
language sql
stable
as $$
  select s.client_key, s.invoice_id, s.invoice_date, s.amount, s.invoice_number
  from unnest(p_codes) as c(k)
  cross join lateral (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
      i.invoice_id,
      i.invoice_date,
      i.amount,
      i.invoice_number
    from public.invoices i
    where coalesce(nullif(trim(i.company_code), ''), i.client_id, '') = c.k
    order by i.invoice_date desc, i.invoice_id desc
    limit 5
  ) s;
$$;

grant execute on function public.recent_invoices_for_clients(text[]) to anon;
