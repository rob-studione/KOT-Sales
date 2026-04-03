-- Add explicit company_name fields (LT business usage)

alter table public.companies
  add column if not exists company_name text;

alter table public.invoices
  add column if not exists company_name text;

-- Backfill companies.company_name from legacy companies.name (if present)
update public.companies
set company_name = nullif(name, '')
where (company_name is null or company_name = '') and name is not null and name <> '';

-- Keep legacy column in sync if you still have it in UI
update public.companies
set name = coalesce(nullif(name, ''), coalesce(company_name, ''))
where (name is null or name = '') and company_name is not null and company_name <> '';

-- Update trigger to carry company_name from invoices into companies
create or replace function public.handle_new_invoice()
returns trigger
language plpgsql
as $$
begin
  insert into public.companies (
    company_code,
    company_name,
    name,
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
    last_invoice_date = greatest(coalesce(companies.last_invoice_date, excluded.last_invoice_date), excluded.last_invoice_date),
    invoice_count = companies.invoice_count + 1,
    total_revenue = companies.total_revenue + excluded.total_revenue,
    updated_at = now();

  return new;
end;
$$;

