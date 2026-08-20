-- Manager KPI: unique-call bool_or was dropping "Neatsiliepė".
-- Outcome rows set kanban_status to NULL, so `FALSE OR NULL` became NULL.
-- bool_or(NULL) stays NULL, then `had_not_answered AND NOT is_answered` is NULL
-- and COUNT(*) FILTER skips it. Coerce flags with IS TRUE / coalesce.

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
      ) is true as is_answered,
      (
        af.call_status_lc in ('not_answered', 'neatsiliepė', 'neatsiliepe')
        or af.kanban_status in ('Skambinti','Perskambinti')
      ) is true as is_not_answered
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
      coalesce(cd.is_answered, false) as is_answered,
      (coalesce(cd.had_not_answered, false) and not coalesce(cd.is_answered, false)) as is_not_answered,
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
  'Manager KPI: unique call per (performed_by, work_item, Vilnius day); answered wins; unanswered flags are never null.';

revoke all on function public.manager_kpi_dashboard_v1(date, date, date, date) from public;
grant execute on function public.manager_kpi_dashboard_v1(date, date, date, date) to authenticated;

notify pgrst, 'reload schema';
