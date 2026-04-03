-- Align DB column names with Invoice123 OpenAPI (nested `client` on invoice):
-- https://app.invoice123.com/docs/definitions/openapi.1_0.json — schema `Invoices` → `client`.
--
-- Mapping:
--   client.code        → companies.code / invoices.code (unique key for aggregates + URLs)
--   client.name        → companies.name / invoices.name
--   client.code_type   → code_type  ("company" | "personal")
--   client.country_code → country_code
--   client.id          → client_id (Invoice123 client record id; also stored on companies)

alter table public.companies
  add column if not exists code_type text,
  add column if not exists country_code text,
  add column if not exists client_id text;

alter table public.invoices
  add column if not exists code_type text,
  add column if not exists country_code text;

-- Merge legacy company_name into name, then drop company_name on companies.
update public.companies
set name = coalesce(nullif(trim(name), ''), nullif(trim(company_name), ''))
where company_name is not null and trim(company_name) <> '';

alter table public.companies drop column if exists company_name;

alter table public.companies rename column company_code to code;
alter table public.invoices rename column company_code to code;
alter table public.invoices rename column company_name to name;

drop index if exists public.invoices_company_code_idx;
create index if not exists invoices_code_idx on public.invoices(code);

create or replace function public.handle_new_invoice()
returns trigger
language plpgsql
as $$
begin
  insert into public.companies (
    code,
    name,
    code_type,
    country_code,
    client_id,
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
    new.code,
    coalesce(nullif(new.name, ''), new.code),
    nullif(new.code_type, ''),
    nullif(new.country_code, ''),
    nullif(new.client_id, ''),
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
  on conflict (code)
  do update set
    name = coalesce(nullif(excluded.name, ''), companies.name),
    code_type = coalesce(nullif(excluded.code_type, ''), companies.code_type),
    country_code = coalesce(nullif(excluded.country_code, ''), companies.country_code),
    client_id = coalesce(nullif(excluded.client_id, ''), companies.client_id),
    vat_code = coalesce(nullif(excluded.vat_code, ''), companies.vat_code),
    address = coalesce(nullif(excluded.address, ''), companies.address),
    email = coalesce(nullif(excluded.email, ''), companies.email),
    phone = coalesce(nullif(excluded.phone, ''), companies.phone),
    last_invoice_date = greatest(coalesce(companies.last_invoice_date, excluded.last_invoice_date), excluded.last_invoice_date),
    invoice_count = companies.invoice_count + 1,
    total_revenue = companies.total_revenue + excluded.total_revenue,
    updated_at = now();

  return new;
end;
$$;
