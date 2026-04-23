-- Lightweight counts for "Darbas" and "Užbaigta" tab labels.

create or replace function public.project_work_item_counts(p_project_id uuid)
returns table (open_count bigint, completed_count bigint)
language sql
stable
set search_path = public
as $$
  with base as (
    select lower(trim(coalesce(w.result_status, ''))) as st
    from public.project_work_items w
    where w.project_id = p_project_id
  ),
  closed as (
    select
      st,
      (st in (
        'completed',
        'closed',
        'cancelled',
        'uždaryta',
        'lost',
        'neaktualus',
        'completion_sent_email',
        'completion_sent_commercial',
        'completion_relevant_as_needed',
        'completion_translations_not_relevant',
        'completion_other_provider',
        'completion_procurement_invite_participate',
        'completion_procurement_include_purchase',
        'completion_procurement_contact_failed',
        'completion_procurement_not_relevant',
        'completion_procurement_other',
        'returned_to_candidates'
      )) as is_closed,
      (st = 'returned_to_candidates') as is_returned
    from base
  )
  select
    count(*) filter (where not is_closed)::bigint as open_count,
    count(*) filter (where is_closed and not is_returned)::bigint as completed_count
  from closed;
$$;

comment on function public.project_work_item_counts(uuid) is
  'Count-only helper for /projektai/[id] tab labels: open work items vs completed (excluding returned_to_candidates).';

grant execute on function public.project_work_item_counts(uuid) to anon;
grant execute on function public.project_work_item_counts(uuid) to authenticated;

notify pgrst, 'reload schema';

