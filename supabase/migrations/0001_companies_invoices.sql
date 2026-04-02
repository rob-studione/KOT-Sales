-- Supabase schema for a minimal CRM:
-- - `companies`: aggregates per company_code
-- - `invoices`: raw invoices per invoice_id
-- - trigger updates company aggregates on invoice insert

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_code text not null unique,
  name text not null default '',
  last_invoice_date date null,
  invoice_count integer not null default 0,
  total_revenue numeric not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null unique,
  company_code text not null,
  invoice_date date not null,
  amount numeric not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists invoices_company_code_idx on public.invoices(company_code);
create index if not exists invoices_invoice_date_idx on public.invoices(invoice_date);

-- Row-level security + public (anon) policies.
-- This app has no auth, so we allow anon to read companies and insert invoices.
alter table public.companies enable row level security;
alter table public.invoices enable row level security;

-- Companies: read for clients page; write is needed because the invoice trigger updates aggregates.
drop policy if exists "companies_select_public" on public.companies;
create policy "companies_select_public"
  on public.companies
  for select
  to anon
  using (true);

drop policy if exists "companies_write_public" on public.companies;
create policy "companies_write_public"
  on public.companies
  for insert
  to anon
  with check (true);

drop policy if exists "companies_update_public" on public.companies;
create policy "companies_update_public"
  on public.companies
  for update
  to anon
  using (true)
  with check (true);

-- Invoices: allow inserts (trigger runs immediately and aggregates into companies).
drop policy if exists "invoices_select_public" on public.invoices;
create policy "invoices_select_public"
  on public.invoices
  for select
  to anon
  using (true);

drop policy if exists "invoices_insert_public" on public.invoices;
create policy "invoices_insert_public"
  on public.invoices
  for insert
  to anon
  with check (true);

-- Ensure anon has the needed table privileges.
grant select on public.companies to anon;
grant insert, update on public.companies to anon;
grant select, insert on public.invoices to anon;

-- Trigger function: create/update company aggregates on invoice insert.
create or replace function public.handle_new_invoice()
returns trigger
language plpgsql
as $$
begin
  insert into public.companies (
    company_code,
    name,
    last_invoice_date,
    invoice_count,
    total_revenue,
    created_at,
    updated_at
  )
  values (
    new.company_code,
    new.company_code, -- No company name is provided by the invoice schema; use company_code as a simple default.
    new.invoice_date,
    1,
    new.amount,
    now(),
    now()
  )
  on conflict (company_code)
  do update set
    last_invoice_date = greatest(coalesce(last_invoice_date, new.invoice_date), new.invoice_date),
    invoice_count = invoice_count + 1,
    total_revenue = total_revenue + new.amount,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists invoices_after_insert_handle_new_invoice on public.invoices;
create trigger invoices_after_insert_handle_new_invoice
  after insert on public.invoices
  for each row
  execute function public.handle_new_invoice();

