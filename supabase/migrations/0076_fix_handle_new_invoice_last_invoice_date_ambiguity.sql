-- Fix: "column reference \"last_invoice_date\" is ambiguous"
-- Root cause: legacy `handle_new_invoice()` used unqualified `last_invoice_date`
-- in an `INSERT ... ON CONFLICT ... DO UPDATE` where both target and `excluded`
-- expose the same column name.
--
-- This migration replaces the trigger function with fully qualified references:
-- - `companies.last_invoice_date`
-- - `excluded.last_invoice_date`
--
-- Supports both schemas used in this repo:
-- - legacy: companies.company_code / invoices.company_code + invoices.company_name
-- - openapi-aligned: companies.code / invoices.code + invoices.name

do $$
declare
  has_code boolean;
  has_company_code boolean;
  has_company_name boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='companies' and column_name='code'
  ) into has_code;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='companies' and column_name='company_code'
  ) into has_company_code;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='company_name'
  ) into has_company_name;

  if has_code then
    -- OpenAPI-aligned schema: companies.code / invoices.code, invoices.name
    execute $fn$
      create or replace function public.handle_new_invoice()
      returns trigger
      language plpgsql
      as $body$
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
          last_invoice_date = greatest(
            coalesce(companies.last_invoice_date, excluded.last_invoice_date),
            excluded.last_invoice_date
          ),
          invoice_count = companies.invoice_count + 1,
          total_revenue = companies.total_revenue + excluded.total_revenue,
          updated_at = now();

        return new;
      end;
      $body$;
    $fn$;
  elsif has_company_code then
    -- Legacy schema: companies.company_code / invoices.company_code
    -- Some environments also have explicit invoices.company_name.
    if has_company_name then
      execute $fn$
        create or replace function public.handle_new_invoice()
        returns trigger
        language plpgsql
        as $body$
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
            last_invoice_date = greatest(
              coalesce(companies.last_invoice_date, excluded.last_invoice_date),
              excluded.last_invoice_date
            ),
            invoice_count = companies.invoice_count + 1,
            total_revenue = companies.total_revenue + excluded.total_revenue,
            updated_at = now();

          return new;
        end;
        $body$;
      $fn$;
    else
      execute $fn$
        create or replace function public.handle_new_invoice()
        returns trigger
        language plpgsql
        as $body$
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
            new.company_code,
            new.invoice_date,
            1,
            new.amount,
            now(),
            now()
          )
          on conflict (company_code)
          do update set
            last_invoice_date = greatest(
              coalesce(companies.last_invoice_date, excluded.last_invoice_date),
              excluded.last_invoice_date
            ),
            invoice_count = companies.invoice_count + 1,
            total_revenue = companies.total_revenue + excluded.total_revenue,
            updated_at = now();

          return new;
        end;
        $body$;
      $fn$;
    end if;
  else
    raise notice 'Skipped: companies table missing code/company_code columns';
  end if;
end $$;

