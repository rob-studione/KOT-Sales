-- Store real company/client master data from Invoice123 (LT CRM fields)

alter table public.companies
  add column if not exists vat_code text,
  add column if not exists address text,
  add column if not exists email text,
  add column if not exists phone text;

alter table public.invoices
  add column if not exists vat_code text,
  add column if not exists address text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists client_id text;

create index if not exists invoices_client_id_idx on public.invoices(client_id);

-- Update trigger to carry company master fields from invoices into companies
create or replace function public.handle_new_invoice()
returns trigger
language plpgsql
as $$
begin
  insert into public.companies (
    company_code,
    company_name,
    name,
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
    nullif(new.company_name, ''),
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
    name = coalesce(nullif(excluded.company_name, ''), companies.name),
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

