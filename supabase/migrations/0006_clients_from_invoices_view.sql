-- Clients list derived only from public.invoices (Saskaita123 snapshots per row).
-- Latest client fields = row from the most recent invoice per company_code.

create or replace view public.v_client_list_from_invoices as
with agg as (
  select
    company_code,
    count(*)::bigint as invoice_count,
    max(invoice_date)::date as last_invoice_date,
    sum(amount) as total_revenue
  from public.invoices
  group by company_code
),
latest as (
  select distinct on (i.company_code)
    i.company_code,
    i.company_name,
    i.vat_code,
    i.address,
    i.email,
    i.phone,
    i.client_id
  from public.invoices i
  order by i.company_code, i.invoice_date desc, i.invoice_id desc
)
select
  a.company_code,
  l.company_name,
  l.vat_code,
  l.address,
  l.email,
  l.phone,
  l.client_id,
  a.last_invoice_date,
  a.invoice_count,
  a.total_revenue
from agg a
inner join latest l on l.company_code = a.company_code;

grant select on public.v_client_list_from_invoices to anon;

-- Recent invoices (up to 5 per client) for expanded rows; p_codes = current page client codes.
create or replace function public.recent_invoices_for_clients(p_codes text[])
returns table (
  company_code text,
  invoice_id text,
  invoice_date date,
  amount numeric
)
language sql
stable
as $$
  select s.company_code, s.invoice_id, s.invoice_date, s.amount
  from unnest(p_codes) as c(company_code)
  cross join lateral (
    select
      i.company_code,
      i.invoice_id,
      i.invoice_date,
      i.amount
    from public.invoices i
    where i.company_code = c.company_code
    order by i.invoice_date desc, i.invoice_id desc
    limit 5
  ) s;
$$;

grant execute on function public.recent_invoices_for_clients(text[]) to anon;

create or replace function public.dashboard_stats_from_invoices()
returns table (
  client_count bigint,
  invoice_count bigint,
  total_revenue numeric,
  last_invoice_date date
)
language sql
stable
as $$
  select
    (select count(distinct i.company_code) from public.invoices i),
    (select count(*) from public.invoices i),
    (select coalesce(sum(i.amount), 0) from public.invoices i),
    (select max(i.invoice_date)::date from public.invoices i);
$$;

grant execute on function public.dashboard_stats_from_invoices() to anon;
