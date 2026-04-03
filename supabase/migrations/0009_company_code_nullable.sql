-- Allow missing company_code (no literal UNKNOWN); optional company_name empty.
-- client_key = coalesce(company_code, client_id, '') — '' = bucket be kodo ir be client_id.

update public.invoices
set company_code = null
where company_code is not null and upper(trim(company_code)) = 'UNKNOWN';

update public.invoices
set company_name = ''
where company_name is not null and upper(trim(company_name)) = 'UNKNOWN';

alter table public.invoices
  alter column company_code drop not null;

-- Trigger: skip companies aggregate when no company code
create or replace function public.handle_new_invoice()
returns trigger
language plpgsql
as $$
begin
  if new.company_code is not null and trim(new.company_code) <> '' then
    insert into public.companies (
      company_code,
      company_name,
      vat_code,
      address,
      email,
      phone,
      last_invoice_date,
      invoice_count,
      total_revenue,
      created_at,
      updated_at
    )
    values (
      trim(new.company_code),
      coalesce(nullif(trim(new.company_name), ''), trim(new.company_code)),
      nullif(new.vat_code, ''),
      nullif(new.address, ''),
      nullif(new.email, ''),
      nullif(new.phone, ''),
      new.invoice_date,
      1,
      new.amount,
      now(),
      now()
    )
    on conflict (company_code)
    do update set
      company_name = coalesce(nullif(excluded.company_name, ''), companies.company_name),
      vat_code = coalesce(nullif(excluded.vat_code, ''), companies.vat_code),
      address = coalesce(nullif(excluded.address, ''), companies.address),
      email = coalesce(nullif(excluded.email, ''), companies.email),
      phone = coalesce(nullif(excluded.phone, ''), companies.phone),
      last_invoice_date = greatest(
        coalesce(companies.last_invoice_date, excluded.last_invoice_date),
        excluded.last_invoice_date
      ),
      invoice_count = companies.invoice_count + 1,
      total_revenue = companies.total_revenue + excluded.total_revenue,
      updated_at = now();
  end if;

  return new;
end;
$$;

create or replace view public.v_client_list_from_invoices as
with agg as (
  select
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
    count(*)::bigint as invoice_count,
    max(i.invoice_date)::date as last_invoice_date,
    sum(i.amount) as total_revenue
  from public.invoices i
  group by 1
),
latest as (
  select distinct on (coalesce(nullif(trim(i.company_code), ''), i.client_id, ''))
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
    nullif(trim(i.company_code), '') as company_code,
    i.client_id,
    i.company_name,
    i.vat_code,
    i.address,
    i.email,
    i.phone
  from public.invoices i
  order by coalesce(nullif(trim(i.company_code), ''), i.client_id, ''), i.invoice_date desc, i.invoice_id desc
)
select
  a.client_key,
  l.company_code,
  l.client_id,
  l.company_name,
  l.vat_code,
  l.address,
  l.email,
  l.phone,
  a.last_invoice_date,
  a.invoice_count,
  a.total_revenue
from agg a
inner join latest l on l.client_key = a.client_key;

grant select on public.v_client_list_from_invoices to anon;

create or replace function public.recent_invoices_for_clients(p_codes text[])
returns table (
  client_key text,
  invoice_id text,
  invoice_date date,
  amount numeric
)
language sql
stable
as $$
  select s.client_key, s.invoice_id, s.invoice_date, s.amount
  from unnest(p_codes) as c(k)
  cross join lateral (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
      i.invoice_id,
      i.invoice_date,
      i.amount
    from public.invoices i
    where coalesce(nullif(trim(i.company_code), ''), i.client_id, '') = c.k
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
    (select count(*)::bigint from (
       select 1
       from public.invoices i
       group by coalesce(nullif(trim(i.company_code), ''), i.client_id, '')
     ) g),
    (select count(*)::bigint from public.invoices i),
    (select coalesce(sum(i.amount), 0) from public.invoices i),
    (select max(i.invoice_date)::date from public.invoices i);
$$;

grant execute on function public.dashboard_stats_from_invoices() to anon;
