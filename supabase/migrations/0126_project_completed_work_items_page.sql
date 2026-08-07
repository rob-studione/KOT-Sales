-- Užbaigta (kontaktuota) tab: server-side search + status counts + page.
-- Excludes same-day "Užbaigta" cards (they stay on Darbas until next Vilnius day).

create or replace function public.project_completed_work_items_page(
  p_project_id uuid,
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null
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
      least(greatest(coalesce(p_limit, 20), 1), 100) as v_limit,
      greatest(coalesce(p_offset, 0), 0) as v_offset,
      nullif(trim(coalesce(p_search, '')), '') as v_search,
      nullif(trim(coalesce(p_status, '')), '') as v_status,
      (now() at time zone 'Europe/Vilnius')::date as today_vilnius
  ),
  completed_statuses as (
    select unnest(array[
      'completed',
      'closed',
      'cancelled',
      'lost',
      'neaktualus',
      'uždaryta',
      'completion_sent_email',
      'completion_sent_commercial',
      'completion_relevant_as_needed',
      'completion_translations_not_relevant',
      'completion_other_provider',
      'completion_company_liquidated',
      'completion_procurement_invite_participate',
      'completion_procurement_include_purchase',
      'completion_procurement_contact_failed',
      'completion_procurement_not_relevant',
      'completion_procurement_other'
    ]::text[]) as status
  ),
  base as (
    select
      w.id,
      w.source_type,
      w.source_id,
      w.client_key,
      w.client_identifier_display,
      w.client_name_snapshot,
      w.assigned_to,
      w.picked_at,
      w.snapshot_order_count,
      w.snapshot_revenue,
      w.snapshot_last_invoice_date,
      w.snapshot_priority,
      w.call_status,
      w.next_action,
      w.next_action_date,
      w.comment,
      w.result_status,
      w.work_updated_at,
      coalesce(nullif(trim(w.result_status), ''), 'completed') as status_key
    from public.project_work_items w
    cross join params p
    where w.project_id = p_project_id
      and lower(trim(coalesce(w.result_status, ''))) in (
        select lower(status) from completed_statuses
      )
      -- Same-day Užbaigta stay on Darbas (work_updated_at Vilnius day).
      and not (
        trim(coalesce(w.call_status, '')) = 'Užbaigta'
        and w.work_updated_at is not null
        and (w.work_updated_at at time zone 'Europe/Vilnius')::date = p.today_vilnius
      )
  ),
  searched as (
    select b.*
    from base b
    cross join params p
    where p.v_search is null
      or coalesce(b.client_name_snapshot, '') ilike '%' || p.v_search || '%'
      or coalesce(b.client_key, '') ilike '%' || p.v_search || '%'
      or coalesce(b.client_identifier_display, '') ilike '%' || p.v_search || '%'
  ),
  status_counts as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object('status', s.status_key, 'count', s.cnt)
          order by s.cnt desc, s.status_key asc
        ),
        '[]'::jsonb
      ) as arr,
      coalesce(sum(s.cnt), 0)::bigint as total_after_search
    from (
      select status_key, count(*)::bigint as cnt
      from searched
      group by status_key
    ) s
  ),
  filtered as (
    select s.*
    from searched s
    cross join params p
    where p.v_status is null
      or s.status_key = p.v_status
  ),
  counted as (
    select count(*)::bigint as filtered_total from filtered
  ),
  page as (
    select f.*
    from filtered f
    order by f.picked_at desc nulls last, f.id desc
    limit (select v_limit from params)
    offset (select v_offset from params)
  ),
  items as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'source_type', p.source_type,
          'source_id', p.source_id,
          'client_key', p.client_key,
          'client_identifier_display', p.client_identifier_display,
          'client_name_snapshot', p.client_name_snapshot,
          'assigned_to', p.assigned_to,
          'picked_at', p.picked_at,
          'snapshot_order_count', p.snapshot_order_count,
          'snapshot_revenue', p.snapshot_revenue,
          'snapshot_last_invoice_date', p.snapshot_last_invoice_date,
          'snapshot_priority', p.snapshot_priority,
          'call_status', p.call_status,
          'next_action', p.next_action,
          'next_action_date', p.next_action_date,
          'comment', p.comment,
          'result_status', p.result_status,
          'work_updated_at', p.work_updated_at
        )
        order by p.picked_at desc nulls last, p.id desc
      ),
      '[]'::jsonb
    ) as arr
    from page p
  )
  select jsonb_build_object(
    'total_after_search', (select total_after_search from status_counts),
    'filtered_total', (select filtered_total from counted),
    'status_counts', (select arr from status_counts),
    'items', (select arr from items)
  );
$$;

comment on function public.project_completed_work_items_page(uuid, integer, integer, text, text) is
  'Užbaigta tab: paged completed work items with search and status chip counts.';

revoke all on function public.project_completed_work_items_page(uuid, integer, integer, text, text) from public;
grant execute on function public.project_completed_work_items_page(uuid, integer, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
