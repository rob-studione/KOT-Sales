-- Procurement Apžvalga funnel: count įstaigos (organizacijos), not raw contracts.
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
  org_key_expr as (
    -- Same idea as app `procurementOrgClientKey`: code first, else normalized name.
    select
      c.id as contract_id,
      case
        when nullif(trim(c.organization_code), '') is not null
          and upper(trim(c.organization_code)) not like 'PERSON\_%' escape '\'
          then 'po:' || trim(c.organization_code)
        when nullif(trim(c.organization_name), '') is not null
          then 'po:name:' || lower(regexp_replace(trim(c.organization_name), '\s+', ' ', 'g'))
        else 'po:id:' || c.id::text
      end as org_key,
      coalesce(c.value, 0)::numeric as value_eur
    from public.project_procurement_contracts c
    where c.project_id = p_project_id
  ),
  procurement_work as (
    select
      w.id as work_item_id,
      lower(trim(coalesce(w.result_status, ''))) as result_status_lc,
      case
        when left(trim(coalesce(w.client_key, '')), 3) = 'po:'
          then trim(w.client_key)
        when o.org_key is not null
          then o.org_key
        else 'wi:' || w.id::text
      end as org_key
    from public.project_work_items w
    left join org_key_expr o on o.contract_id = w.source_id
    where w.project_id = p_project_id
      and coalesce(w.source_type, '') = 'procurement_contract'
  ),
  acts as (
    select
      a.work_item_id,
      pw.org_key,
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
      count(distinct af.org_key) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.totals_ts_from
          and af.occurred_at <= b.totals_ts_to
      )::bigint as called_orgs,
      count(distinct af.org_key) filter (
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
      count(distinct af.org_key) filter (
        where af.action_type = 'call'
          and af.occurred_at >= b.period_ts_from
          and af.occurred_at <= b.period_ts_to
      )::bigint as called_orgs,
      count(distinct af.org_key) filter (
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
      count(distinct pw.org_key) filter (
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
      count(distinct pw.org_key) filter (
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
  orgs as (
    select
      count(distinct org_key)::bigint as organizations_count,
      coalesce(sum(value_eur), 0) as total_value_eur
    from org_key_expr
  ),
  totals_row as (select * from effort where scope = 'totals'),
  period_row as (select * from effort where scope = 'period')
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'organizations', (select organizations_count from orgs),
      -- Legacy alias (UI/RPC parsers): same as organizations.
      'contracts', (select organizations_count from orgs),
      'calls', (select calls from totals_row),
      'contacted', (select contacted from totals_row),
      'calledWorkItems', (select called_orgs from totals_row),
      'invitedOrIncluded', (select totals_invited from invited),
      'totalValueEur', (select total_value_eur from orgs)
    ),
    'period', jsonb_build_object(
      'calls', (select calls from period_row),
      'contacted', (select contacted from period_row),
      'contactedConversionPercent', case
        when (select called_orgs from period_row) > 0
          then ((select contacted from period_row)::numeric / (select called_orgs from period_row)::numeric) * 100
        else null
      end,
      'invitedOrIncluded', (select period_invited from invited)
    )
  );
$$;

comment on function public.project_procurement_overview_analytics(uuid, date, date, date, date) is
  'Procurement Apžvalga: funnel by organization (įstaiga), not per contract.';

revoke all on function public.project_procurement_overview_analytics(uuid, date, date, date, date) from public;
grant execute on function public.project_procurement_overview_analytics(uuid, date, date, date, date) to authenticated;

notify pgrst, 'reload schema';
