-- Dashboard perf: dashboard_sales_analytics_v1
-- - UTC occurred_at bounds (index-friendly) instead of filtering only on TZ-cast date
-- - Separate KPI activity window vs attribution window (sales_from-365)
-- - Drop unused daily `trend` JSON (chart uses dashboard_month_call_counts_by_day)
-- - first_invoice_any only for clients in sales window (not full invoice history GROUP BY)
-- - Invoice list payload capped at 40 (UI preview 10 + expand)
-- - SECURITY DEFINER + 30s statement_timeout

create or replace function public.dashboard_sales_analytics_v1(
  p_range_from date,
  p_range_to   date,
  p_sales_from date,
  p_sales_to   date
)
returns jsonb
language sql
stable
security definer
set search_path = public
set timezone = 'UTC'
set statement_timeout = '30s'
as $$
with
params as (
  select
    least(p_range_from, p_range_to) as range_from,
    greatest(p_range_from, p_range_to) as range_to,
    least(p_sales_from, p_sales_to) as sales_from,
    greatest(p_sales_from, p_sales_to) as sales_to
),
windows as (
  select
    p.*,
    -- KPI / conversion activity: selected dashboard range
    (p.range_from::timestamp at time zone 'Europe/Vilnius') as range_ts_from,
    ((p.range_to + 1)::timestamp at time zone 'Europe/Vilnius') as range_ts_to,
    -- Attribution: contact within 365d before invoice (need history before sales_from)
    ((p.sales_from - 365)::timestamp at time zone 'Europe/Vilnius') as attr_ts_from,
    ((p.sales_to + 1)::timestamp at time zone 'Europe/Vilnius') as attr_ts_to
  from params p
),

acts_base as (
  select
    a.work_item_id,
    a.occurred_at,
    (a.occurred_at at time zone 'Europe/Vilnius')::date as local_day,
    lower(trim(coalesce(a.action_type, ''))) as action_type,
    trim(coalesce(a.call_status, '')) as call_status_raw,
    lower(trim(coalesce(a.call_status, ''))) as call_status_lc,
    trim(coalesce(a.next_action, '')) as next_action_raw,
    nullif(trim(w.client_key), '') as client_key
  from public.project_work_item_activities a
  join public.project_work_items w
    on w.id = a.work_item_id
  cross join windows win
  where a.occurred_at >= win.attr_ts_from
    and a.occurred_at < win.attr_ts_to
),

acts_flags as (
  select
    ab.*,
    case
      when ab.call_status_lc in ('answered', 'atsiliepė', 'atsiliepe', 'not_answered', 'neatsiliepė', 'neatsiliepe')
        then null
      when ab.call_status_raw in ('', 'Neatsiliepė') then 'Skambinti'
      when ab.call_status_raw = 'Perskambins' then 'Perskambinti'
      when ab.call_status_raw in ('Laukti', 'Susisiekti vėliau', 'Aktualu pagal poreikį') then 'Perskambinti'
      when ab.call_status_raw in ('Skambinti','Perskambinti','Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
        then ab.call_status_raw
      else 'Skambinti'
    end as kanban_status
  from acts_base ab
),

acts_range as (
  select
    af.*,
    (
      af.call_status_lc in ('answered', 'atsiliepė', 'atsiliepe')
      or af.kanban_status in ('Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
    ) as is_answered,
    (
      af.call_status_lc in ('not_answered', 'neatsiliepė', 'neatsiliepe')
      or af.kanban_status in ('Skambinti','Perskambinti')
    ) as is_not_answered
  from acts_flags af
  cross join windows win
  where af.occurred_at >= win.range_ts_from
    and af.occurred_at < win.range_ts_to
),

kpi_activity as (
  select
    count(*) filter (where action_type = 'call') as calls,
    count(*) filter (where action_type = 'call' and is_answered) as answered_calls,
    count(*) filter (where action_type = 'commercial') as commercial_actions
  from acts_range
),

invoices_sales as (
  select
    i.invoice_id,
    i.invoice_date::date as invoice_day,
    public.invoice_amount_net(i.amount, i.amount_net, i.tax_amount, i.tax_rate) as amount,
    coalesce(nullif(trim(i.invoice_number), ''), i.invoice_id) as invoice_number,
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
    nullif(trim(i.company_name), '') as company_name_raw
  from public.invoices i
  cross join windows win
  where i.series_title ilike 'VK-%'
    and i.invoice_number not ilike 'VK-000IS%'
    and i.invoice_number not ilike 'VK-000KR%'
    and i.invoice_date::date between win.sales_from and win.sales_to
    and coalesce(nullif(trim(i.company_code), ''), i.client_id, '') <> ''
),

sales_clients as (
  select distinct client_key from invoices_sales
),

first_invoice_any as (
  select
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
    min(i.invoice_date::date) as first_invoice_day
  from public.invoices i
  where i.series_title ilike 'VK-%'
    and i.invoice_number not ilike 'VK-000IS%'
    and i.invoice_number not ilike 'VK-000KR%'
    and coalesce(nullif(trim(i.company_code), ''), i.client_id, '') in (select client_key from sales_clients)
  group by 1
),

invoices_attributed as (
  select
    s.*,
    fia.first_invoice_day,
    (fia.first_invoice_day is not null and fia.first_invoice_day < s.invoice_day) as is_returning
  from invoices_sales s
  left join first_invoice_any fia on fia.client_key = s.client_key
  where exists (
    select 1
    from acts_flags af
    where af.client_key = s.client_key
      and af.action_type in ('call', 'email', 'meeting')
      and af.local_day between (s.invoice_day - 365) and s.invoice_day
  )
),

cold_returning_kpi as (
  select
    coalesce(sum(case when coalesce(i.is_returning, false) then 0 else i.amount end), 0) as cold_eur,
    coalesce(sum(case when coalesce(i.is_returning, false) then i.amount else 0 end), 0) as returning_eur
  from invoices_attributed i
),

cold_invoices as (
  select
    ia.invoice_number,
    ia.invoice_day,
    ia.amount,
    ia.client_key,
    coalesce(nullif(trim(v.company_name), ''), ia.company_name_raw) as company_name
  from invoices_attributed ia
  left join public.v_client_list_from_invoices v
    on v.client_key = ia.client_key
  where coalesce(ia.is_returning, false) = false
  order by ia.invoice_day desc, ia.invoice_id desc
  limit 40
),

returning_invoices as (
  select
    ia.invoice_number,
    ia.invoice_day,
    ia.amount,
    ia.client_key,
    coalesce(nullif(trim(v.company_name), ''), ia.company_name_raw) as company_name
  from invoices_attributed ia
  left join public.v_client_list_from_invoices v
    on v.client_key = ia.client_key
  where coalesce(ia.is_returning, false) = true
  order by ia.invoice_day desc, ia.invoice_id desc
  limit 40
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

invoices_range as (
  select
    i.invoice_date::date as invoice_day,
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key
  from public.invoices i
  cross join windows win
  where i.series_title ilike 'VK-%'
    and i.invoice_number not ilike 'VK-000IS%'
    and i.invoice_number not ilike 'VK-000KR%'
    and i.invoice_date::date between win.range_from and win.range_to
    and coalesce(nullif(trim(i.company_code), ''), i.client_id, '') <> ''
),

conversion_clients as (
  select distinct ir.client_key
  from invoices_range ir
  join first_call_range fcr on fcr.client_key = ir.client_key
  where ir.invoice_day > (fcr.first_call_at at time zone 'UTC')::date
),

kpi as (
  select
    ka.calls,
    ka.answered_calls,
    ka.commercial_actions,
    crk.cold_eur,
    crk.returning_eur,
    (select count(*)::bigint from conversion_clients) as clients_with_orders
  from kpi_activity ka
  cross join cold_returning_kpi crk
)

select jsonb_build_object(
  'kpi', jsonb_build_object(
    'calls', coalesce(k.calls, 0),
    'answeredCalls', coalesce(k.answered_calls, 0),
    'commercialActions', coalesce(k.commercial_actions, 0),
    'coldRevenueEur', coalesce(k.cold_eur, 0),
    'returningRevenueEur', coalesce(k.returning_eur, 0),
    'conversionPercent',
      case
        when coalesce(k.answered_calls, 0) > 0 then round((k.clients_with_orders::numeric / k.answered_calls::numeric) * 1000) / 10
        else null
      end
  ),
  -- Kept for API compatibility; UI chart uses dashboard_month_call_counts_by_day.
  'trend', '[]'::jsonb,
  'coldInvoices', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'invoiceNumber', ci.invoice_number,
          'date', to_char(ci.invoice_day, 'YYYY-MM-DD'),
          'amount', ci.amount,
          'clientKey', ci.client_key,
          'companyName', ci.company_name
        )
        order by ci.invoice_day desc
      )
      from cold_invoices ci
    ),
    '[]'::jsonb
  ),
  'returningInvoices', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'invoiceNumber', ri.invoice_number,
          'date', to_char(ri.invoice_day, 'YYYY-MM-DD'),
          'amount', ri.amount,
          'clientKey', ri.client_key,
          'companyName', ri.company_name
        )
        order by ri.invoice_day desc
      )
      from returning_invoices ri
    ),
    '[]'::jsonb
  )
)
from kpi k;
$$;

revoke all on function public.dashboard_sales_analytics_v1(date, date, date, date) from public;
grant execute on function public.dashboard_sales_analytics_v1(date, date, date, date) to authenticated;

notify pgrst, 'reload schema';
