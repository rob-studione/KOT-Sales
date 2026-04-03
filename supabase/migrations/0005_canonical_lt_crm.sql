-- =============================================================================
-- Canonical LT CRM (Saskaita123 / Invoice123) — BOOTSTRAP FOR EMPTY / RESET DB
-- Safe to paste into Supabase SQL Editor on a fresh project or after truncate.
-- Idempotent: drops CRM tables + triggers if they exist, then recreates canonical schema.
-- =============================================================================

create extension if not exists pgcrypto;

-- Tear down: CASCADE removes triggers on tables. Functions dropped so re-run is clean.
drop table if exists public.invoices cascade;
drop table if exists public.companies cascade;

drop function if exists public.invoices_set_updated_at();
drop function if exists public.handle_new_invoice();

-- ---------------------------------------------------------------------------
-- companies: one row per company_code (aggregates from invoices via trigger)
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  company_code text not null,
  company_name text not null default '',
  vat_code text null,
  address text null,
  email text null,
  phone text null,
  last_invoice_date date null,
  invoice_count integer not null default 0,
  total_revenue numeric not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint companies_company_code_key unique (company_code)
);

create index if not exists companies_company_code_idx on public.companies (company_code);

-- ---------------------------------------------------------------------------
-- invoices: snapshot per Saskaita123 invoice + nested client.* mapping
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  client_id text null,
  company_name text not null default '',
  company_code text not null,
  vat_code text null,
  address text null,
  email text null,
  phone text null,
  invoice_date date not null,
  amount numeric not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint invoices_invoice_id_key unique (invoice_id)
);

create index if not exists invoices_company_code_idx on public.invoices (company_code);
create index if not exists invoices_invoice_date_idx on public.invoices (invoice_date);
create index if not exists invoices_client_id_idx on public.invoices (client_id);

-- ---------------------------------------------------------------------------
-- RLS (app uses anon key — no auth)
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "companies_select_public" on public.companies;
create policy "companies_select_public"
  on public.companies for select to anon using (true);

drop policy if exists "companies_write_public" on public.companies;
create policy "companies_write_public"
  on public.companies for insert to anon with check (true);

drop policy if exists "companies_update_public" on public.companies;
create policy "companies_update_public"
  on public.companies for update to anon using (true) with check (true);

drop policy if exists "invoices_select_public" on public.invoices;
create policy "invoices_select_public"
  on public.invoices for select to anon using (true);

drop policy if exists "invoices_insert_public" on public.invoices;
create policy "invoices_insert_public"
  on public.invoices for insert to anon with check (true);

grant select on public.companies to anon;
grant insert, update on public.companies to anon;
grant select, insert on public.invoices to anon;

-- ---------------------------------------------------------------------------
-- Trigger: aggregate into companies on each invoice INSERT
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_invoice()
returns trigger
language plpgsql
as $$
begin
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
    new.company_code,
    coalesce(nullif(new.company_name, ''), new.company_code),
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

  return new;
end;
$$;

create trigger invoices_after_insert_handle_new_invoice
  after insert on public.invoices
  for each row
  execute function public.handle_new_invoice();

-- ---------------------------------------------------------------------------
-- Touch invoices.updated_at on UPDATE (optional future upserts)
-- ---------------------------------------------------------------------------
create or replace function public.invoices_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row
  execute function public.invoices_set_updated_at();
