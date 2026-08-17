-- Call KPI: count at most one call per work item per Vilnius day.
-- Manager KPI also keys by performed_by (one credit per manager + card + day).
-- Answered wins if any call that day was answered.
-- Leaving Užbaigta is handled in app code (status_change, not call).

create or replace function public.manager_kpi_dashboard_v1(
  p_from date,
  p_to date,
  p_compare_from date default null,
  p_compare_to date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
set timezone = 'UTC'
set statement_timeout = '30s'
as $$
  with params as (
    select
      least(p_from, p_to) as cur_from,
      greatest(p_from, p_to) as cur_to,
      case
        when p_compare_from is null or p_compare_to is null then null
        else least(p_compare_from, p_compare_to)
      end as cmp_from,
      case
        when p_compare_from is null or p_compare_to is null then null
        else greatest(p_compare_from, p_compare_to)
      end as cmp_to
  ),
  windows as (
    select
      p.*,
      (p.cur_from::timestamp at time zone 'Europe/Vilnius') as cur_ts_from,
      ((p.cur_to + 1)::timestamp at time zone 'Europe/Vilnius') as cur_ts_to,
      case
        when p.cmp_from is null then null
        else (p.cmp_from::timestamp at time zone 'Europe/Vilnius')
      end as cmp_ts_from,
      case
        when p.cmp_to is null then null
        else ((p.cmp_to + 1)::timestamp at time zone 'Europe/Vilnius')
      end as cmp_ts_to,
      least(
        (p.cur_from::timestamp at time zone 'Europe/Vilnius'),
        coalesce(
          (p.cmp_from::timestamp at time zone 'Europe/Vilnius'),
          (p.cur_from::timestamp at time zone 'Europe/Vilnius')
        )
      ) as span_ts_from,
      greatest(
        ((p.cur_to + 1)::timestamp at time zone 'Europe/Vilnius'),
        coalesce(
          ((p.cmp_to + 1)::timestamp at time zone 'Europe/Vilnius'),
          ((p.cur_to + 1)::timestamp at time zone 'Europe/Vilnius')
        )
      ) as span_ts_to
    from params p
  ),
  kpi_users as (
    select u.id::text as user_id
    from public.crm_users u
    where u.status = 'active'
      and coalesce(u.is_kpi_tracked, false) = true
  ),
  first_act as (
    select
      (min(a.occurred_at) at time zone 'Europe/Vilnius')::date as first_day
    from public.project_work_item_activities a
  ),
  acts_base as (
    select
      a.work_item_id,
      a.occurred_at,
      (a.occurred_at at time zone 'Europe/Vilnius')::date as local_day,
      lower(trim(coalesce(a.action_type, ''))) as action_type,
      trim(coalesce(a.call_status, '')) as call_status_raw,
      lower(trim(coalesce(a.call_status, ''))) as call_status_lc,
      nullif(trim(coalesce(a.performed_by::text, '')), '') as performed_by,
      nullif(trim(coalesce(w.assigned_to::text, '')), '') as assigned_to,
      (a.occurred_at >= win.cur_ts_from and a.occurred_at < win.cur_ts_to) as in_cur,
      (
        win.cmp_ts_from is not null
        and a.occurred_at >= win.cmp_ts_from
        and a.occurred_at < win.cmp_ts_to
      ) as in_prev
    from public.project_work_item_activities a
    left join public.project_work_items w on w.id = a.work_item_id
    cross join windows win
    where a.occurred_at >= win.span_ts_from
      and a.occurred_at < win.span_ts_to
      and lower(trim(coalesce(a.action_type, ''))) in ('call', 'commercial')
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
        when ab.call_status_raw in (
          'Skambinti','Perskambinti','Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta'
        ) then ab.call_status_raw
        else 'Skambinti'
      end as kanban_status
    from acts_base ab
  ),
  acts_scored as (
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
  ),
  call_days as (
    select
      af.performed_by as user_id,
      af.work_item_id,
      af.local_day,
      bool_or(af.in_cur) as in_cur,
      bool_or(af.in_prev) as in_prev,
      bool_or(af.is_answered) as is_answered,
      bool_or(af.is_not_answered) as had_not_answered
    from acts_scored af
    where af.action_type = 'call'
      and af.performed_by is not null
    group by af.performed_by, af.work_item_id, af.local_day
  ),
  attributed as (
    select
      cd.user_id,
      cd.local_day,
      cd.in_cur,
      cd.in_prev,
      true as is_call,
      cd.is_answered,
      (cd.had_not_answered and not cd.is_answered) as is_not_answered,
      false as is_commercial
    from call_days cd
    union all
    select
      coalesce(af.performed_by, af.assigned_to) as user_id,
      af.local_day,
      af.in_cur,
      af.in_prev,
      false as is_call,
      false as is_answered,
      false as is_not_answered,
      true as is_commercial
    from acts_scored af
    where af.action_type = 'commercial'
      and coalesce(af.performed_by, af.assigned_to) is not null
  ),
  attributed_kpi as (
    select a.*
    from attributed a
    inner join kpi_users ku on ku.user_id = a.user_id
  ),
  by_user as (
    select
      user_id,
      count(*) filter (where is_call and in_cur)::bigint as calls,
      count(*) filter (where is_call and in_cur and is_answered)::bigint as answered,
      count(*) filter (where is_call and in_cur and is_not_answered)::bigint as not_answered,
      count(*) filter (where is_commercial and in_cur)::bigint as commercial,
      count(*) filter (where is_call and in_prev)::bigint as prev_calls,
      count(*) filter (where is_call and in_prev and is_answered)::bigint as prev_answered,
      count(*) filter (where is_call and in_prev and is_not_answered)::bigint as prev_not_answered,
      count(*) filter (where is_commercial and in_prev)::bigint as prev_commercial
    from attributed_kpi
    group by user_id
  ),
  users_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', u.user_id,
          'calls', u.calls,
          'answered', u.answered,
          'notAnswered', u.not_answered,
          'commercial', u.commercial,
          'prevCalls', u.prev_calls,
          'prevAnswered', u.prev_answered,
          'prevNotAnswered', u.prev_not_answered,
          'prevCommercial', u.prev_commercial
        )
        order by u.user_id
      ),
      '[]'::jsonb
    ) as arr
    from by_user u
  ),
  chart_days as (
    select
      local_day,
      count(*) filter (where is_call)::bigint as calls,
      count(*) filter (where is_call and is_answered)::bigint as answered,
      count(*) filter (where is_commercial)::bigint as commercial
    from attributed_kpi
    where in_cur
    group by local_day
  ),
  chart_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(c.local_day, 'YYYY-MM-DD'),
          'calls', c.calls,
          'answered', c.answered,
          'commercial', c.commercial
        )
        order by c.local_day
      ),
      '[]'::jsonb
    ) as arr
    from chart_days c
  ),
  team as (
    select
      coalesce(sum(calls), 0)::bigint as calls,
      coalesce(sum(answered), 0)::bigint as answered,
      coalesce(sum(not_answered), 0)::bigint as not_answered,
      coalesce(sum(commercial), 0)::bigint as commercial,
      coalesce(sum(prev_calls), 0)::bigint as prev_calls,
      coalesce(sum(prev_answered), 0)::bigint as prev_answered,
      coalesce(sum(prev_not_answered), 0)::bigint as prev_not_answered,
      coalesce(sum(prev_commercial), 0)::bigint as prev_commercial
    from by_user
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'from', to_char((select cur_from from params), 'YYYY-MM-DD'),
      'to', to_char((select cur_to from params), 'YYYY-MM-DD')
    ),
    'compareRange', case
      when (select cmp_from from params) is null then null
      else jsonb_build_object(
        'from', to_char((select cmp_from from params), 'YYYY-MM-DD'),
        'to', to_char((select cmp_to from params), 'YYYY-MM-DD')
      )
    end,
    'firstActivityDate', case
      when (select first_day from first_act) is null then null
      else to_char((select first_day from first_act), 'YYYY-MM-DD')
    end,
    'users', (select arr from users_json),
    'chart', (select arr from chart_json),
    'team', jsonb_build_object(
      'calls', (select calls from team),
      'answered', (select answered from team),
      'notAnswered', (select not_answered from team),
      'commercial', (select commercial from team),
      'prevCalls', (select prev_calls from team),
      'prevAnswered', (select prev_answered from team),
      'prevNotAnswered', (select prev_not_answered from team),
      'prevCommercial', (select prev_commercial from team)
    )
  );
$$;

comment on function public.manager_kpi_dashboard_v1(date, date, date, date) is
  'Manager KPI: unique call per (performed_by, work_item, Vilnius day); answered wins.';

revoke all on function public.manager_kpi_dashboard_v1(date, date, date, date) from public;
grant execute on function public.manager_kpi_dashboard_v1(date, date, date, date) to authenticated;

create or replace function public.dashboard_month_call_counts_by_day(
  p_start_utc timestamptz,
  p_end_utc timestamptz
)
returns table (
  day text,
  calls bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    to_char(d.local_day, 'YYYY-MM-DD') as day,
    count(*)::bigint as calls
  from (
    select distinct
      pwa.work_item_id,
      (pwa.occurred_at at time zone 'Europe/Vilnius')::date as local_day
    from public.project_work_item_activities pwa
    where pwa.action_type = 'call'
      and pwa.occurred_at >= p_start_utc
      and pwa.occurred_at <= p_end_utc
  ) d
  group by d.local_day
  order by 1;
$$;

grant execute on function public.dashboard_month_call_counts_by_day(timestamptz, timestamptz) to anon;
grant execute on function public.dashboard_month_call_counts_by_day(timestamptz, timestamptz) to authenticated;

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
    (p.range_from::timestamp at time zone 'Europe/Vilnius') as range_ts_from,
    ((p.range_to + 1)::timestamp at time zone 'Europe/Vilnius') as range_ts_to,
    ((p.sales_from - 365)::timestamp at time zone 'Europe/Vilnius') as attr_ts_from,
    ((p.sales_to + 1)::timestamp at time zone 'Europe/Vilnius') as attr_ts_to,
    p.sales_from::timestamptz as sales_ts_from,
    (p.sales_to::timestamp + interval '1 day' - interval '1 millisecond')::timestamptz as sales_ts_to
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

kpi_call_days as (
  select
    work_item_id,
    local_day,
    bool_or(is_answered) as is_answered
  from acts_range
  where action_type = 'call'
  group by work_item_id, local_day
),

kpi_activity as (
  select
    (select count(*) from kpi_call_days) as calls,
    (select count(*) from kpi_call_days where is_answered) as answered_calls,
    (select count(*) filter (where action_type = 'commercial') from acts_range) as commercial_actions
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
      and af.action_type in ('call', 'email', 'meeting', 'commercial')
      and af.local_day between (s.invoice_day - 365) and s.invoice_day
  )
),

cold_returning_kpi as (
  select
    coalesce(sum(case when coalesce(i.is_returning, false) then 0 else i.amount end), 0) as cold_eur,
    coalesce(sum(case when coalesce(i.is_returning, false) then i.amount else 0 end), 0) as returning_eur
  from invoices_attributed i
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
),

project_work_parts as (
  select
    wi.project_id,
    wi.id as work_item_id,
    trim(coalesce(wi.client_key, '')) as client_key,
    min((a.occurred_at at time zone 'UTC')::date) as contact_date
  from public.project_work_items wi
  join public.projects p on p.id = wi.project_id
  join public.project_work_item_activities a on a.work_item_id = wi.id
  cross join windows win
  where p.deleted_at is null
    and p.status <> 'deleted'
    and trim(coalesce(wi.client_key, '')) <> ''
    and lower(trim(coalesce(a.action_type, ''))) in ('call', 'email', 'commercial', 'note')
    and a.occurred_at >= win.sales_ts_from
    and a.occurred_at <= win.sales_ts_to
  group by wi.project_id, wi.id, trim(coalesce(wi.client_key, ''))
),

project_work_enriched as (
  select
    wp.*,
    nullif(trim(v.company_code), '') as company_code,
    nullif(trim(v.client_id), '') as client_id
  from project_work_parts wp
  left join public.v_client_list_from_invoices v
    on trim(coalesce(v.client_key, '')) = wp.client_key
),

project_inv as (
  select
    i.invoice_id,
    nullif(trim(i.company_code), '') as company_code,
    nullif(trim(i.client_id), '') as client_id,
    i.invoice_date::date as invoice_date,
    public.invoice_amount_net(i.amount, i.amount_net, i.tax_amount, i.tax_rate) as amount_eur
  from public.invoices i
  cross join windows win
  where i.series_title ilike 'VK-%'
    and i.invoice_number not ilike 'VK-000IS%'
    and i.invoice_number not ilike 'VK-000KR%'
    and i.invoice_date::date between win.sales_from and win.sales_to
    and public.invoice_amount_net(i.amount, i.amount_net, i.tax_amount, i.tax_rate) is not null
),

project_matches as (
  select
    we.project_id,
    inv.invoice_id,
    inv.amount_eur,
    we.contact_date,
    we.client_key
  from project_inv inv
  inner join project_work_enriched we
    on inv.invoice_date > we.contact_date
   and (
     (we.company_code is not null and inv.company_code = we.company_code)
     or (
       we.company_code is null
       and we.client_id is not null
       and inv.company_code is null
       and inv.client_id = we.client_id
     )
   )
),

project_picked as (
  select distinct on (m.project_id, m.invoice_id)
    m.project_id,
    m.invoice_id,
    m.amount_eur
  from project_matches m
  order by m.project_id, m.invoice_id, m.contact_date asc, m.client_key asc
),

project_revenues as (
  select
    p.id as project_id,
    p.name as project_name,
    coalesce(sum(case when coalesce(ia.is_returning, false) then 0 else pp.amount_eur end), 0)::numeric as cold_eur,
    coalesce(sum(case when coalesce(ia.is_returning, false) then pp.amount_eur else 0 end), 0)::numeric as returning_eur,
    coalesce(sum(pp.amount_eur), 0)::numeric as total_eur
  from project_picked pp
  join public.projects p on p.id = pp.project_id
  left join invoices_attributed ia on ia.invoice_id = pp.invoice_id
  where p.deleted_at is null
    and p.status <> 'deleted'
  group by p.id, p.name
  having coalesce(sum(pp.amount_eur), 0) > 0
  order by total_eur desc, p.name asc
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
  'trend', '[]'::jsonb,
  'coldInvoices', '[]'::jsonb,
  'returningInvoices', '[]'::jsonb,
  'projectRevenues', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'projectId', pr.project_id,
          'projectName', pr.project_name,
          'coldEur', pr.cold_eur,
          'returningEur', pr.returning_eur,
          'totalEur', pr.total_eur
        )
        order by pr.total_eur desc, pr.project_name asc
      )
      from project_revenues pr
    ),
    '[]'::jsonb
  )
)
from kpi k;
$$;

comment on function public.dashboard_sales_analytics_v1(date, date, date, date) is
  'Sales analytics: unique call per (work_item, Vilnius day) for activity KPI.';

revoke all on function public.dashboard_sales_analytics_v1(date, date, date, date) from public;
grant execute on function public.dashboard_sales_analytics_v1(date, date, date, date) to authenticated;

notify pgrst, 'reload schema';
