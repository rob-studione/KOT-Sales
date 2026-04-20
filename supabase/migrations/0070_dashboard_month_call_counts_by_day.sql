-- Dashboard: skambučių skaičius pagal kalendorinę dieną (Vilnius) be raw eilučių tempimo į app.

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
    to_char((pwa.occurred_at at time zone 'Europe/Vilnius')::date, 'YYYY-MM-DD') as day,
    count(*)::bigint as calls
  from public.project_work_item_activities pwa
  where pwa.action_type = 'call'
    and pwa.occurred_at >= p_start_utc
    and pwa.occurred_at <= p_end_utc
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_month_call_counts_by_day(timestamptz, timestamptz) to anon;
grant execute on function public.dashboard_month_call_counts_by_day(timestamptz, timestamptz) to authenticated;
