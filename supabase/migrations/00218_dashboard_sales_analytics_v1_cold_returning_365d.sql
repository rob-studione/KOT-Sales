-- Dashboard Sales Analytics (v1): switch sales KPI Direct/Influenced -> Cold/Returning.
--
-- Requirements:
-- - Keep activity KPIs and trend unchanged.
-- - Sales KPI invoices are included only if:
--   1) invoice_date is within [p_sales_from, p_sales_to]
--   2) there exists at least one relevant action (call/email/meeting) with the same client_key
--      within 365 days before (and including) invoice_date.
-- - Cold/Returning classification is invoice-level and based on GLOBAL invoice history:
--   Cold = no earlier invoice exists before this invoice_date for the same client_key
--   Returning = at least one earlier invoice exists before this invoice_date
-- - Keep invoice exclusions (VK-000IS%, VK-000KR%) and series_title VK-%.
-- - Do NOT use "invoice_date > first_call_at" filter.
--
-- Notes:
-- - `client_key` is the system's effective company identifier:
--   coalesce(nullif(trim(company_code), ''), client_id, '').
--
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

-- ------------------------------------------------------------
-- Activities (union) + flags
-- ------------------------------------------------------------
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
      au.next_action_raw ~* 'aktualu\\s+pagal\\s+poreikį'
      or au.call_status_raw ~* 'aktualu\\s+pagal\\s+poreikį'
    ) as is_actualu
  from acts_union au
),

acts_range as (
  select af.*
  from acts_flags af
  join params p on true
  where af.local_day between p.range_from and p.range_to
),

-- ------------------------------------------------------------
-- KPI: activity (range) - unchanged, counts all rows (no client_key filter)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Trend: unchanged (range)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Invoices: KPI window (sales) + global history for first-invoice day
-- ------------------------------------------------------------
invoices_sales as (
  select
    i.invoice_id,
    i.invoice_date::date as invoice_day,
    i.amount::numeric as amount,
    coalesce(nullif(trim(i.invoice_number), ''), i.invoice_id) as invoice_number,
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
    nullif(trim(i.company_name), '') as company_name_raw
  from public.invoices i
  join params p on true
  where i.series_title ilike 'VK-%'
    and i.invoice_number not ilike 'VK-000IS%'
    and i.invoice_number not ilike 'VK-000KR%'
    and i.invoice_date::date between p.sales_from and p.sales_to
    and coalesce(nullif(trim(i.company_code), ''), i.client_id, '') <> ''
),

-- Global: first invoice day per client_key across full history (VK-% + exclusions)
first_invoice_any as (
  select
    coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as client_key,
    min(i.invoice_date::date) as first_invoice_day
  from public.invoices i
  where i.series_title ilike 'VK-%'
    and i.invoice_number not ilike 'VK-000IS%'
    and i.invoice_number not ilike 'VK-000KR%'
    and coalesce(nullif(trim(i.company_code), ''), i.client_id, '') <> ''
  group by 1
),

-- Attribution: relevant action exists within 365d before invoice_day (inclusive).
-- Uses the same client_key that ties activities to invoices.
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

-- Sales KPI sums: Cold/Returning by global first_invoice_day.
cold_returning_kpi as (
  select
    coalesce(sum(case when coalesce(i.is_returning, false) then 0 else i.amount end), 0) as cold_eur,
    coalesce(sum(case when coalesce(i.is_returning, false) then i.amount else 0 end), 0) as returning_eur
  from invoices_attributed i
),

-- Breakdown (10 newest each), with company name mapping from view (same as previous directInvoices).
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
  limit 10
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
  limit 10
),

-- conversion: unchanged (still based on invoice in range after first call in range)
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
  join params p on true
  where i.series_title ilike 'VK-%'
    and i.invoice_number not ilike 'VK-000IS%'
    and i.invoice_number not ilike 'VK-000KR%'
    and i.invoice_date::date between p.range_from and p.range_to
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

grant execute on function public.dashboard_sales_analytics_v1(date, date, date, date) to authenticated;

