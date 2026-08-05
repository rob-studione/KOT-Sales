-- Naujos sąskaitos: companies.total_revenue += suma be PVM (ne gross).
-- Taip pat patikslina invoice_amount_net kai žinomas ne-standartinis tarifas.

create or replace function public.invoice_amount_net(
  p_amount numeric,
  p_amount_net numeric,
  p_tax_amount numeric,
  p_tax_rate numeric
)
returns numeric
language sql
immutable
as $$
  select coalesce(
    p_amount_net,
    case when p_tax_amount is not null then round(coalesce(p_amount, 0) - p_tax_amount, 2) end,
    case when p_tax_rate is not null and p_tax_rate = 0 then p_amount end,
    case
      when p_tax_rate is not null and p_tax_rate > 0 and p_amount is not null
      then round(p_amount / (1 + p_tax_rate / 100), 2)
    end,
    case when p_amount is null then null else round(p_amount / 1.21, 2) end
  );
$$;

grant execute on function public.invoice_amount_net(numeric, numeric, numeric, numeric) to authenticated;

do $$
declare
  has_code boolean;
  has_company_code boolean;
  has_company_name boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'code'
  ) into has_code;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'company_code'
  ) into has_company_code;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'company_name'
  ) into has_company_name;

  if has_code then
    execute $fn$
      create or replace function public.handle_new_invoice()
      returns trigger
      language plpgsql
      as $body$
      declare
        v_net numeric;
      begin
        v_net := public.invoice_amount_net(new.amount, new.amount_net, new.tax_amount, new.tax_rate);

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
          coalesce(v_net, 0),
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
    if has_company_name then
      execute $fn$
        create or replace function public.handle_new_invoice()
        returns trigger
        language plpgsql
        as $body$
        declare
          v_net numeric;
        begin
          v_net := public.invoice_amount_net(new.amount, new.amount_net, new.tax_amount, new.tax_rate);

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
            coalesce(v_net, 0),
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
        declare
          v_net numeric;
        begin
          v_net := public.invoice_amount_net(new.amount, new.amount_net, new.tax_amount, new.tax_rate);

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
            coalesce(v_net, 0),
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
