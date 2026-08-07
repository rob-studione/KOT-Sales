-- Apžvalga: aggregate project activity KPIs + month call trend in SQL (no 50k row dump).
-- Also procurement Apžvalga: project-scoped effort metrics (no global 20k activity pull).

create or replace function public.project_overview_analytics(
  p_project_id uuid,
  p_from date,
  p_to date
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
      -- Match Node rangeToUtcBounds (calendar day as UTC wall clock)
      least(p_from, p_to)::timestamptz as ts_from,
      (greatest(p_from, p_to)::timestamp + interval '1 day' - interval '1 millisecond')::timestamptz as ts_to,
      (now() at time zone 'Europe/Vilnius')::date as today_vilnius
  ),
  month_bounds as (
    select
      date_trunc('month', b.today_vilnius::timestamp)::date as month_from,
      (date_trunc('month', b.today_vilnius::timestamp) + interval '1 month' - interval '1 day')::date as month_to,
      (date_trunc('month', b.today_vilnius::timestamp) at time zone 'Europe/Vilnius') as month_ts_from,
      ((date_trunc('month', b.today_vilnius::timestamp) + interval '1 month') at time zone 'Europe/Vilnius') as month_ts_to
    from bounds b
  ),
  period_acts as (
    select
      lower(trim(coalesce(a.action_type, ''))) as action_type,
      trim(coalesce(a.call_status, '')) as call_status_raw,
      lower(trim(coalesce(a.call_status, ''))) as call_status_lc
    from public.project_work_item_activities a
    inner join public.project_work_items w on w.id = a.work_item_id
    cross join bounds b
    where w.project_id = p_project_id
      and a.occurred_at >= b.ts_from
      and a.occurred_at <= b.ts_to
  ),
  period_flags as (
    select
      pa.*,
      case
        when pa.call_status_lc in ('answered', 'atsiliepė', 'atsiliepe', 'not_answered', 'neatsiliepė', 'neatsiliepe')
          then null
        when pa.call_status_raw in ('', 'Neatsiliepė') then 'Skambinti'
        when pa.call_status_raw = 'Perskambins' then 'Perskambinti'
        when pa.call_status_raw in ('Laukti', 'Susisiekti vėliau', 'Aktualu pagal poreikį') then 'Perskambinti'
        when pa.call_status_raw in (
          'Skambinti','Perskambinti','Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta'
        ) then pa.call_status_raw
        else 'Skambinti'
      end as kanban_status
    from period_acts pa
  ),
  period_kpi as (
    select
      count(*) filter (where action_type = 'call')::bigint as calls,
      count(*) filter (
        where action_type = 'call'
          and (
            call_status_lc in ('answered', 'atsiliepė', 'atsiliepe')
            or kanban_status in ('Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
          )
      )::bigint as answered,
      count(*) filter (
        where action_type = 'call'
          and (
            call_status_lc in ('not_answered', 'neatsiliepė', 'neatsiliepe')
            or kanban_status in ('Skambinti','Perskambinti')
          )
      )::bigint as not_answered,
      count(*) filter (where action_type = 'email')::bigint as emails,
      count(*) filter (where action_type = 'commercial')::bigint as commercial
    from period_flags
  ),
  month_calls as (
    select
      (a.occurred_at at time zone 'Europe/Vilnius')::date as local_day,
      count(*)::bigint as calls
    from public.project_work_item_activities a
    inner join public.project_work_items w on w.id = a.work_item_id
    cross join month_bounds mb
    where w.project_id = p_project_id
      and lower(trim(coalesce(a.action_type, ''))) = 'call'
      and a.occurred_at >= mb.month_ts_from
      and a.occurred_at < mb.month_ts_to
    group by 1
  ),
  month_trend as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(g.day::date, 'YYYY-MM-DD'),
          'calls', coalesce(mc.calls, 0)
        )
        order by g.day
      ),
      '[]'::jsonb
    ) as arr
    from month_bounds mb
    cross join lateral generate_series(mb.month_from, mb.month_to, interval '1 day') as g(day)
    left join month_calls mc on mc.local_day = g.day::date
  ),
  work_counts as (
    select
      count(*)::bigint as total_picked,
      count(*) filter (
        where lower(trim(coalesce(result_status, ''))) <> 'returned_to_candidates'
          and lower(trim(coalesce(result_status, ''))) in (
            'completed','closed','cancelled','uždaryta','lost','neaktualus',
            'completion_sent_email','completion_sent_commercial','completion_relevant_as_needed',
            'completion_translations_not_relevant','completion_other_provider',
            'completion_company_liquidated','completion_procurement_invite_participate',
            'completion_procurement_include_purchase','completion_procurement_contact_failed',
            'completion_procurement_not_relevant','completion_procurement_other'
          )
      )::bigint as completed,
      count(*) filter (
        where lower(trim(coalesce(result_status, ''))) <> 'returned_to_candidates'
          and lower(trim(coalesce(result_status, ''))) not in (
            'completed','closed','cancelled','uždaryta','lost','neaktualus',
            'completion_sent_email','completion_sent_commercial','completion_relevant_as_needed',
            'completion_translations_not_relevant','completion_other_provider',
            'completion_company_liquidated','completion_procurement_invite_participate',
            'completion_procurement_include_purchase','completion_procurement_contact_failed',
            'completion_procurement_not_relevant','completion_procurement_other'
          )
      )::bigint as active
    from public.project_work_items
    where project_id = p_project_id
  )
  select jsonb_build_object(
    'kpi', jsonb_build_object(
      'calls', (select calls from period_kpi),
      'answered', (select answered from period_kpi),
      'notAnswered', (select not_answered from period_kpi),
      'emails', (select emails from period_kpi),
      'commercial', (select commercial from period_kpi),
      'answerRatePercent', case
        when (select calls from period_kpi) > 0
          then round(((select answered from period_kpi)::numeric / (select calls from period_kpi)::numeric) * 1000) / 10
        else null
      end
    ),
    'monthRange', jsonb_build_object(
      'from', to_char((select month_from from month_bounds), 'YYYY-MM-DD'),
      'to', to_char((select month_to from month_bounds), 'YYYY-MM-DD')
    ),
    'monthCallsTrend', (select arr from month_trend),
    'work', jsonb_build_object(
      'totalPicked', (select total_picked from work_counts),
      'active', (select active from work_counts),
      'completed', (select completed from work_counts)
    )
  );
$$;

comment on function public.project_overview_analytics(uuid, date, date) is
  'Project Apžvalga: period activity KPIs, current Vilnius month call trend, work counts.';

revoke all on function public.project_overview_analytics(uuid, date, date) from public;
grant execute on function public.project_overview_analytics(uuid, date, date) to authenticated;

-- Procurement Apžvalga: totals (lifetime) + period effort in one round-trip.
create or replace function public.project_procurement_overview_analytics(
  p_project_id uuid,
  p_period_from date,
  p_period_to date,
  p_totals_from date,
  p_totals_to date
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
      least(p_period_from, p_period_to) as period_from,
      greatest(p_period_from, p_period_to) as period_to,
      least(p_totals_from, p_totals_to) as totals_from,
      greatest(p_totals_from, p_totals_to) as totals_to
  ),
  bounds as (
    select
      p.*,
      p.period_from::timestamptz as period_ts_from,
      (p.period_to::timestamp + interval '1 day' - interval '1 millisecond')::timestamptz as period_ts_to,
      p.totals_from::timestamptz as totals_ts_from,
      (p.totals_to::timestamp + interval '1 day' - interval '1 millisecond')::timestamptz as totals_ts_to
    from params p
  ),
  procurement_work as (
    select
      w.id as work_item_id,
      lower(trim(coalesce(w.result_status, ''))) as result_status_lc
    from public.project_work_items w
    where w.project_id = p_project_id
      and coalesce(w.source_type, '') = 'procurement_contract'
  ),
  acts as (
    select
      a.work_item_id,
      a.occurred_at,
      lower(trim(coalesce(a.action_type, ''))) as action_type,
      trim(coalesce(a.call_status, '')) as call_status_raw,
      lower(trim(coalesce(a.call_status, ''))) as call_status_lc
    from public.project_work_item_activities a
    inner join procurement_work pw on pw.work_item_id = a.work_item_id
    cross join bounds b
    where a.occurred_at >= b.totals_ts_from
      and a.occurred_at <= greatest(b.totals_ts_to, b.period_ts_to)
  ),
  acts_flags as (
    select
      a.*,
      case
        when a.call_status_lc in ('answered', 'atsiliepė', 'atsiliepe', 'not_answered', 'neatsiliepė', 'neatsiliepe')
          then null
        when a.call_status_raw in ('', 'Neatsiliepė') then 'Skambinti'
        when a.call_status_raw = 'Perskambins' then 'Perskambinti'
        when a.call_status_raw in ('Laukti', 'Susisiekti vėliau', 'Aktualu pagal poreikį') then 'Perskambinti'
        when a.call_status_raw in (
          'Skambinti','Perskambinti','Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta'
        ) then a.call_status_raw
        else 'Skambinti'
      end as kanban_status
    from acts a
  ),
  effort as (
    select
      'totals'::text as scope,
      count(*) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.totals_ts_from
          and af.occurred_at <= b.totals_ts_to
      )::bigint as calls,
      count(distinct af.work_item_id) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.totals_ts_from
          and af.occurred_at <= b.totals_ts_to
      )::bigint as called_work_items,
      count(distinct af.work_item_id) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.totals_ts_from
          and af.occurred_at <= b.totals_ts_to
          and (
            af.call_status_lc in ('answered', 'atsiliepė', 'atsiliepe')
            or af.kanban_status in ('Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
          )
      )::bigint as contacted
    from acts_flags af
    cross join bounds b
    union all
    select
      'period'::text as scope,
      count(*) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.period_ts_from
          and af.occurred_at <= b.period_ts_to
      )::bigint as calls,
      count(distinct af.work_item_id) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.period_ts_from
          and af.occurred_at <= b.period_ts_to
      )::bigint as called_work_items,
      count(distinct af.work_item_id) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.period_ts_from
          and af.occurred_at <= b.period_ts_to
          and (
            af.call_status_lc in ('answered', 'atsiliepė', 'atsiliepe')
            or af.kanban_status in ('Siųsti laišką','Siųsti komercinį','Skubus veiksmas','Užbaigta')
          )
      )::bigint as contacted
    from acts_flags af
    cross join bounds b
  ),
  invited as (
    select
      count(*) filter (
        where exists (
          select 1
          from acts_flags af
          cross join bounds b
          where af.work_item_id = pw.work_item_id
            and af.call_status_raw = 'Užbaigta'
            and af.occurred_at >= b.totals_ts_from
            and af.occurred_at <= b.totals_ts_to
        )
      )::bigint as totals_invited,
      count(*) filter (
        where exists (
          select 1
          from acts_flags af
          cross join bounds b
          where af.work_item_id = pw.work_item_id
            and af.call_status_raw = 'Užbaigta'
            and af.occurred_at >= b.period_ts_from
            and af.occurred_at <= b.period_ts_to
        )
      )::bigint as period_invited
    from procurement_work pw
    where pw.result_status_lc in (
      'completion_procurement_invite_participate',
      'completion_procurement_include_purchase'
    )
  ),
  contracts as (
    select
      count(*)::bigint as contracts_count,
      coalesce(sum(case when c.value is null then 0 else c.value::numeric end), 0) as total_value_eur
    from public.project_procurement_contracts c
    where c.project_id = p_project_id
  ),
  totals_row as (select * from effort where scope = 'totals'),
  period_row as (select * from effort where scope = 'period')
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'contracts', (select contracts_count from contracts),
      'calls', (select calls from totals_row),
      'contacted', (select contacted from totals_row),
      'calledWorkItems', (select called_work_items from totals_row),
      'invitedOrIncluded', (select totals_invited from invited),
      'totalValueEur', (select total_value_eur from contracts)
    ),
    'period', jsonb_build_object(
      'calls', (select calls from period_row),
      'contacted', (select contacted from period_row),
      'contactedConversionPercent', case
        when (select called_work_items from period_row) > 0
          then ((select contacted from period_row)::numeric / (select called_work_items from period_row)::numeric) * 100
        else null
      end,
      'invitedOrIncluded', (select period_invited from invited)
    )
  );
$$;

comment on function public.project_procurement_overview_analytics(uuid, date, date, date, date) is
  'Procurement Apžvalga: project-scoped totals + period effort (no global activity dump).';

revoke all on function public.project_procurement_overview_analytics(uuid, date, date, date, date) from public;
grant execute on function public.project_procurement_overview_analytics(uuid, date, date, date, date) to authenticated;

notify pgrst, 'reload schema';
