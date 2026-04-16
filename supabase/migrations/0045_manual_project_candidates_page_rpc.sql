-- Server-side sujungtas rankinių kandidatų sąrašas (lead + linked), „blocking“ pagal project_work_items.
-- Sinchronizuokite uždarų rezultatų sąrašą su lib/crm/projectBoardConstants.ts → isProjectWorkItemClosed.

create or replace function public.fetch_manual_project_candidates_page(
  p_project_id uuid,
  p_limit integer default 20,
  p_offset integer default 0,
  p_count_only boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with blocking as (
    select distinct w.client_key as ck
    from project_work_items w
    where w.project_id = p_project_id
      and coalesce(trim(w.client_key), '') <> ''
      and lower(trim(coalesce(w.result_status, ''))) not in (
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
        'returned_to_candidates'
      )
  ),
  lead_part as (
    select
      'lead'::text as kind,
      l.created_at,
      row_to_json(l)::jsonb as row_json
    from project_manual_leads l
    where l.project_id = p_project_id
      and not exists (
        select 1 from blocking b where b.ck = ('ml:' || l.id::text)
      )
  ),
  linked_part as (
    select
      'linked'::text as kind,
      c.created_at,
      row_to_json(c)::jsonb as row_json
    from project_manual_linked_clients c
    where c.project_id = p_project_id
      and not exists (
        select 1 from blocking b where b.ck = c.client_key
      )
  ),
  unioned as (
    select * from lead_part
    union all
    select * from linked_part
  ),
  counted as (
    select count(*)::bigint as cnt from unioned
  ),
  lim as (
    select
      case
        when p_count_only then 0
        else least(greatest(coalesce(p_limit, 20), 1), 100)
      end as v_limit,
      case
        when p_count_only then 0
        else greatest(coalesce(p_offset, 0), 0)
      end as v_offset
  ),
  paged as (
    select u.kind, u.created_at, u.row_json
    from unioned u
    order by u.created_at desc
    limit (select v_limit from lim)
    offset (select v_offset from lim)
  ),
  items as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('kind', p.kind, 'row', p.row_json)
        order by p.created_at desc
      ),
      '[]'::jsonb
    ) as arr
    from paged p
  )
  select jsonb_build_object(
    'total_count', (select cnt from counted),
    'items', (select arr from items)
  );
$$;

grant execute on function public.fetch_manual_project_candidates_page(uuid, integer, integer, boolean) to authenticated;

notify pgrst, 'reload schema';
