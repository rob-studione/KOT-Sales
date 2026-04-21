-- Fix: ensure `dashboard_sales_analytics_v1` returns `companyName` for `directInvoices`.
-- Reason: previous migration was already applied; this migration redefines the function again.
--
-- Source of companyName:
-- - primary: public.v_client_list_from_invoices.company_name by matching `client_key`
-- - fallback: public.invoices.company_name (snapshot field on invoice row)

create or replace function public.dashboard_sales_analytics_v1(
  p_range_from date,
  p_range_to   date,
  p_sales_from date,
  p_sales_to   date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
set timezone = 'UTC'
as $$
with
params as (
  select
    least(p_range_from, p_range_to) as range_from,
    greatest(p_range_from, p_range_to) as range_to,
    least(p_sales_from, p_sales_to) as sales_from,
    greatest(p_sales_from, p_sales_to) as sales_to
),
union_window as (
  select
    least(p.range_from, p.sales_from) as union_from,
    greatest(p.range_to, p.sales_to) as union_to
  from params p
),

acts_union as (
  select
    a.work_item_id,
    a.occurred_at,
    (a.occurred_at at time zone 'Europe/Vilnius')::date as local_day,
    lower(trim(coalesce(a.action_type, ''))) as action_type,
    trim(coalesce(a.call_status, '')) as call_status_raw,
    trim(coalesce(a.next_action, '')) as next_action_raw,
    nullif(trim(w.client_key), '') as client_key
  from public.project_work_item_activities a
  join public.project_work_items w
    on w.id = a.work_item_id
  join union_window uw on true
  where (a.occurred_at at time zone 'Europe/Vilnius')::date between uw.union_from and uw.union_to
),

acts_flags as (
  select
    au.*,
    case
      when au.call_status_raw in ('', 'Neatsiliepė') then 'Skambinti'
      when au.call_status_raw = 'Perskambins' then 'Perskambinti'
      when au.call_status_raw in ('Susisiekti vėliau', 'Aktualu pagal poreikį') then 'Laukti'
      when au.call_status_raw in ('Skambinti','Perskambinti','Laukti','Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
        then au.call_status_raw
      else 'Skambinti'
    end as kanban_status,
    (
      au.next_action_raw ~* 'aktualu\s+pagal\s+poreikį'
      or au.call_status_raw ~* 'aktualu\s+pagal\s+poreikį'
    ) as is_actualu
  from acts_union au
),

acts_range as (
  select af.*
  from acts_flags af
  join params p on true
  where af.local_day between p.range_from and p.range_to
),

acts_sales as (
  select af.*
  from acts_flags af
  join params p on true
  where af.local_day between p.sales_from and p.sales_to
),

kpi_activity as (
  select
    count(*) filter (where action_type = 'call') as calls,
    count(*) filter (
      where action_type = 'call'
        and kanban_status in ('Laukti','Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
    ) as answered_calls,
    count(*) filter (where action_type = 'commercial') as commercial_actions
  from acts_range
),

trend_days as (
  select gs::date as day
  from params p
  cross join generate_series(p.range_from::timestamp, p.range_to::timestamp, interval '1 day') gs
),
trend_agg as (
  select
    local_day as day,
    count(*) filter (where action_type = 'call') as calls,
    count(*) filter (
      where action_type = 'call'
        and kanban_status in ('Laukti','Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
    ) as answered,
    count(*) filter (
      where action_type = 'call'
        and kanban_status in ('Skambinti','Perskambinti')
    ) as not_answered
  from acts_range
  group by 1
),
trend_full as (
  select
    d.day,
    coalesce(a.calls, 0)::bigint as calls,
    coalesce(a.answered, 0)::bigint as answered,
    coalesce(a.not_answered, 0)::bigint as not_answered
  from trend_days d
  left join trend_agg a on a.day = d.day
),

first_call_range as (
  select
    client_key,
    min(occurred_at) as first_call_at
  from acts_range
  where action_type = 'call'
    and client_key is not null
  group by 1
),

first_call_sales as (
  select
    client_key,
    min(occurred_at) as first_call_at
  from acts_sales
  where action_type = 'call'
    and client_key is not null
  group by 1
),

latest_status_sales as (
  select client_key, is_actualu
  from (
    select
      client_key,
      is_actualu,
      row_number() over (partition by client_key order by occurred_at desc) as rn
    from acts_sales
    where client_key is not null
  ) s
  where rn = 1
),

sales_calls as (
  select count(*)::bigint as calls
  from acts_sales
  where action_type = 'call'
),

invoices_union as (
  select
    i.invoice_id,
    i.invoice_date::date as invoice_day,
    i.amount::numeric as amount,
    coalesce(nullif(trim(i.invoice_number), ''), i.invoice_id) as invoice_number,
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
    nullif(trim(i.company_name), '') as company_name_raw
  from public.invoices i
  join union_window uw on true
  where i.series_title ilike 'VK-%'
    and i.invoice_date::date between uw.union_from and uw.union_to
    and coalesce(nullif(trim(i.company_code), ''), i.client_id, '') <> ''
),

conversion_clients as (
  select distinct iu.client_key
  from invoices_union iu
  join params p on true
  join first_call_range fcr on fcr.client_key = iu.client_key
  where iu.invoice_day between p.range_from and p.range_to
    and iu.invoice_day > (fcr.first_call_at at time zone 'UTC')::date
),

sales_kpi as (
  select
    coalesce(sum(case when coalesce(lss.is_actualu,false) then 0 else iu.amount end), 0) as direct_eur,
    coalesce(sum(case when coalesce(lss.is_actualu,false) then iu.amount else 0 end), 0) as influenced_eur
  from invoices_union iu
  join params p on true
  join first_call_sales fcs on fcs.client_key = iu.client_key
  left join latest_status_sales lss on lss.client_key = iu.client_key
  where iu.invoice_day between p.sales_from and p.sales_to
    and iu.invoice_day > (fcs.first_call_at at time zone 'UTC')::date
),

direct_invoices as (
  select
    iu.invoice_number,
    iu.invoice_day,
    iu.amount,
    iu.client_key,
    coalesce(nullif(trim(v.company_name), ''), iu.company_name_raw) as company_name
  from invoices_union iu
  left join public.v_client_list_from_invoices v
    on v.client_key = iu.client_key
  join params p on true
  join first_call_sales fcs on fcs.client_key = iu.client_key
  left join latest_status_sales lss on lss.client_key = iu.client_key
  where iu.invoice_day between p.sales_from and p.sales_to
    and iu.invoice_day > (fcs.first_call_at at time zone 'UTC')::date
    and coalesce(lss.is_actualu,false) = false
  order by iu.invoice_day desc, iu.invoice_id desc
  limit 10
),

kpi as (
  select
    ka.calls,
    ka.answered_calls,
    ka.commercial_actions,
    sk.direct_eur,
    sk.influenced_eur,
    sc.calls as sales_calls,
    (select count(*)::bigint from conversion_clients) as clients_with_orders
  from kpi_activity ka
  cross join sales_kpi sk
  cross join sales_calls sc
)

select jsonb_build_object(
  'kpi', jsonb_build_object(
    'calls', coalesce(k.calls, 0),
    'answeredCalls', coalesce(k.answered_calls, 0),
    'commercialActions', coalesce(k.commercial_actions, 0),
    'directRevenueEur', coalesce(k.direct_eur, 0),
    'influencedRevenueEur', coalesce(k.influenced_eur, 0),
    'avgEurPerCall',
      case
        when coalesce(k.sales_calls, 0) > 0 then (k.direct_eur / k.sales_calls)::numeric
        else null
      end,
    'conversionPercent',
      case
        when coalesce(k.calls, 0) > 0 then round((k.clients_with_orders::numeric / k.calls::numeric) * 1000) / 10
        else null
      end
  ),
  'trend', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(tf.day, 'YYYY-MM-DD'),
          'calls', tf.calls,
          'answered', tf.answered,
          'notAnswered', tf.not_answered
        )
        order by tf.day
      )
      from trend_full tf
    ),
    '[]'::jsonb
  ),
  'directInvoices', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'invoiceNumber', di.invoice_number,
          'date', to_char(di.invoice_day, 'YYYY-MM-DD'),
          'amount', di.amount,
          'clientKey', di.client_key,
          'companyName', di.company_name
        )
        order by di.invoice_day desc
      )
      from direct_invoices di
    ),
    '[]'::jsonb
  )
)
from kpi k;
$$;

