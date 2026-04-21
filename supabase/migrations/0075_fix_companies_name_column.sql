-- Fix production drift: some environments lack `companies.name` which is referenced by trigger `handle_new_invoice()`.
-- Keep it aligned with `company_name` (or `code`/`company_code` fallback).

alter table public.companies
  add column if not exists name text not null default '';

-- Best-effort backfill (works across both schemas).
do $$
begin
  if to_regclass('public.companies') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='companies' and column_name='company_name'
  ) then
    execute $q$
      update public.companies
      set name = coalesce(nullif(name, ''), nullif(company_name, ''))
      where (name is null or name = '') and company_name is not null and company_name <> ''
    $q$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='companies' and column_name='code'
  ) then
    execute $q$
      update public.companies
      set name = coalesce(nullif(name, ''), nullif(code, ''))
      where (name is null or name = '') and code is not null and code <> ''
    $q$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='companies' and column_name='company_code'
  ) then
    execute $q$
      update public.companies
      set name = coalesce(nullif(name, ''), nullif(company_code, ''))
      where (name is null or name = '') and company_code is not null and company_code <> ''
    $q$;
  end if;
end $$;

