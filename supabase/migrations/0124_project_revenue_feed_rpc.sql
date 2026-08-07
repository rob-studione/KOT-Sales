-- Project Apžvalga / Pajamos: matched revenue in SQL (no 8k invoice dump to Node).
-- Same semantics as lib/crm/projectAnalytics.ts revenue feed:
--   VK-% series, exclude IS/KR, invoice after first contact in range, net amount,
--   distinct invoice (earliest explaining contact), direct = delta_days <= 30.
-- Also refreshes project_revenue_summary to use the same matching + net amounts.

create or replace function public.project_revenue_feed(
  p_project_id uuid,
  p_from date,
  p_to date,
  p_include_rows boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public
set timezone = 'UTC'
set statement_timeout = '30s'
as $$
  with bounds as (
    select
      least(p_from, p_to) as d_from,
      greatest(p_from, p_to) as d_to,
      least(p_from, p_to)::timestamptz as ts_from,
      (greatest(p_from, p_to)::timestamp + interval '1 day' - interval '1 millisecond')::timestamptz as ts_to
  ),
  w as (
    select
      wi.id as work_item_id,
      trim(coalesce(wi.client_key, '')) as client_key
    from public.project_work_items wi
    where wi.project_id = p_project_id
      and trim(coalesce(wi.client_key, '')) <> ''
  ),
  first_contact as (
    select
      a.work_item_id,
      min((a.occurred_at at time zone 'UTC')::date) as contact_date
    from public.project_work_item_activities a
    inner join w on w.work_item_id = a.work_item_id
    cross join bounds b
    where lower(trim(coalesce(a.action_type, ''))) in ('call', 'email', 'commercial', 'note')
      and a.occurred_at >= b.ts_from
      and a.occurred_at <= b.ts_to
    group by a.work_item_id
  ),
  work_parts as (
    select
      w.work_item_id,
      w.client_key,
      fc.contact_date,
      nullif(trim(v.company_code), '') as company_code,
      nullif(trim(v.client_id), '') as client_id
    from w
    inner join first_contact fc on fc.work_item_id = w.work_item_id
    left join public.v_client_list_from_invoices v
      on trim(coalesce(v.client_key, '')) = w.client_key
  ),
  code_sets as (
    select
      coalesce(
        array_agg(distinct wp.company_code) filter (where wp.company_code is not null),
        '{}'::text[]
      ) as company_codes,
      coalesce(
        array_agg(distinct wp.client_id) filter (
          where wp.company_code is null and wp.client_id is not null
        ),
        '{}'::text[]
      ) as client_ids
    from work_parts wp
  ),
  inv as (
    select
      i.invoice_id,
      i.invoice_number,
      nullif(trim(i.company_code), '') as company_code,
      nullif(trim(i.client_id), '') as client_id,
      coalesce(nullif(trim(i.company_name), ''), '') as company_name,
      i.invoice_date::date as invoice_date,
      public.invoice_amount_net(i.amount, i.amount_net, i.tax_amount, i.tax_rate) as amount_eur
    from public.invoices i
    cross join bounds b
    cross join code_sets c
    where i.series_title ilike 'VK-%'
      and i.invoice_number not ilike 'VK-000IS%'
      and i.invoice_number not ilike 'VK-000KR%'
      and i.invoice_date::date >= b.d_from
      and i.invoice_date::date <= b.d_to
      and public.invoice_amount_net(i.amount, i.amount_net, i.tax_amount, i.tax_rate) is not null
      and (
        (
          cardinality(c.company_codes) > 0
          and nullif(trim(i.company_code), '') = any (c.company_codes)
        )
        or (
          cardinality(c.client_ids) > 0
          and nullif(trim(i.company_code), '') is null
          and nullif(trim(i.client_id), '') = any (c.client_ids)
        )
      )
  ),
  matches as (
    select
      inv.invoice_id,
      inv.invoice_number,
      inv.invoice_date,
      inv.amount_eur,
      inv.company_name,
      inv.company_code,
      inv.client_id,
      wp.client_key,
      wp.contact_date,
      (inv.invoice_date - wp.contact_date) as delta_days
    from inv
    inner join work_parts wp
      on inv.invoice_date > wp.contact_date
     and (
       (wp.company_code is not null and inv.company_code = wp.company_code)
       or (
         wp.company_code is null
         and wp.client_id is not null
         and inv.company_code is null
         and inv.client_id = wp.client_id
       )
     )
  ),
  picked as (
    select distinct on (m.invoice_id)
      m.invoice_id,
      m.invoice_number,
      m.invoice_date,
      m.amount_eur,
      m.company_name,
      m.company_code,
      m.client_id,
      m.client_key,
      m.delta_days,
      case when m.delta_days <= 30 then 'direct' else 'indirect' end as revenue_type
    from matches m
    order by m.invoice_id, m.contact_date asc, m.client_key asc
  ),
  kpi as (
    select
      count(*)::bigint as revenue_count,
      count(distinct p.client_key)::bigint as clients_count,
      coalesce(sum(case when p.revenue_type = 'direct' then p.amount_eur else 0 end), 0)::numeric as direct_eur,
      coalesce(sum(case when p.revenue_type = 'indirect' then p.amount_eur else 0 end), 0)::numeric as indirect_eur,
      coalesce(sum(p.amount_eur), 0)::numeric as total_eur
    from picked p
  ),
  rows_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'invoice_id', p.invoice_id,
          'invoice_number', p.invoice_number,
          'invoice_date', p.invoice_date,
          'amount_eur', p.amount_eur,
          'client_label', coalesce(
            nullif(p.company_name, ''),
            p.company_code,
            p.client_id,
            '—'
          ),
          'revenue_type', p.revenue_type
        )
        order by p.invoice_date desc, p.invoice_id desc
      ),
      '[]'::jsonb
    ) as arr
    from picked p
    where p_include_rows
  )
  select jsonb_build_object(
    'count', (select revenue_count from kpi),
    'clients_count', (select clients_count from kpi),
    'kpi', jsonb_build_object(
      'direct_eur', (select direct_eur from kpi),
      'indirect_eur', (select indirect_eur from kpi),
      'total_eur', (select total_eur from kpi)
    ),
    'rows', case
      when p_include_rows then (select arr from rows_json)
      else '[]'::jsonb
    end
  );
$$;

comment on function public.project_revenue_feed(uuid, date, date, boolean) is
  'Project Pajamos/Apžvalga matched VAT invoices after first contact; optional row feed + KPI.';

revoke all on function public.project_revenue_feed(uuid, date, date, boolean) from public;
grant execute on function public.project_revenue_feed(uuid, date, date, boolean) to authenticated;

-- Keep tab badge summary in sync (net amounts + same match rules).
create or replace function public.project_revenue_summary(
  p_project_id uuid,
  p_from date,
  p_to date
)
returns table (
  revenue_count bigint,
  direct_eur numeric,
  indirect_eur numeric,
  total_eur numeric
)
language sql
stable
security definer
set search_path = public
set timezone = 'UTC'
set statement_timeout = '30s'
as $$
  select
    coalesce((j->>'count')::bigint, 0),
    coalesce((j->'kpi'->>'direct_eur')::numeric, 0),
    coalesce((j->'kpi'->>'indirect_eur')::numeric, 0),
    coalesce((j->'kpi'->>'total_eur')::numeric, 0)
  from (
    select public.project_revenue_feed(p_project_id, p_from, p_to, false) as j
  ) s;
$$;

revoke all on function public.project_revenue_summary(uuid, date, date) from public;
grant execute on function public.project_revenue_summary(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
