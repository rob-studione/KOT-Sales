-- Manual candidates RPC timeout fix.
-- Keep only simple status + search filtering for manual leads.
-- No extra cross-lookups for lead/link dedupe.

drop function if exists public.fetch_manual_project_candidates_page(uuid, integer, integer, boolean, text, text);

create or replace function public.fetch_manual_project_candidates_page(
  p_project_id uuid,
  p_limit integer default 20,
  p_offset integer default 0,
  p_count_only boolean default false,
  p_candidate_status text default 'active',
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
  params as (
    select
      case
        when lower(trim(coalesce(p_candidate_status, 'active'))) = 'netinkamas' then 'netinkamas'
        else 'active'
      end as candidate_st,
      nullif(btrim(coalesce(p_search, '')), '') as q
  ),
  blocking as (
    select distinct trim(w.client_key) as ck
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
      row_to_json(l)::jsonb as row_json,
      l.annual_revenue as sort_revenue,
      coalesce(l.company_name, '') as sort_company_name,
      coalesce(l.company_code, '') as sort_company_code,
      l.id::text as sort_row_id
    from project_manual_leads l
    cross join params p
    where l.project_id = p_project_id
      and l.status = p.candidate_st
      and not exists (
        select 1
        from blocking b
        where lower(b.ck) = lower('ml:' || l.id::text)
      )
      and (
        p.q is null
        or l.company_name ilike '%' || p.q || '%'
        or coalesce(l.company_code, '') ilike '%' || p.q || '%'
      )
  ),
  linked_part as (
    select
      'linked'::text as kind,
      c.created_at,
      row_to_json(c)::jsonb as row_json,
      null::numeric as sort_revenue,
      coalesce(v.company_name, c.client_key, '') as sort_company_name,
      coalesce(
        nullif(trim(coalesce(v.company_code::text, '')), ''),
        c.client_key,
        ''
      ) as sort_company_code,
      c.id::text as sort_row_id
    from project_manual_linked_clients c
    left join v_client_list_from_invoices v on v.client_key = c.client_key
    cross join params p
    where c.project_id = p_project_id
      and p.candidate_st = 'active'
      and not exists (
        select 1 from blocking b where b.ck = trim(c.client_key)
      )
      and (
        p.q is null
        or c.client_key ilike '%' || p.q || '%'
        or coalesce(v.company_name, '') ilike '%' || p.q || '%'
        or coalesce(v.company_code::text, '') ilike '%' || p.q || '%'
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
    select
      u.kind,
      u.created_at,
      u.row_json,
      u.sort_revenue,
      u.sort_company_name,
      u.sort_company_code,
      u.sort_row_id
    from unioned u
    order by
      u.sort_revenue desc nulls last,
      u.sort_company_name asc,
      u.sort_company_code asc,
      u.sort_row_id asc
    limit (select v_limit from lim)
    offset (select v_offset from lim)
  ),
  items as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('kind', p.kind, 'row', p.row_json)
        order by
          p.sort_revenue desc nulls last,
          p.sort_company_name asc,
          p.sort_company_code asc,
          p.sort_row_id asc
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

grant execute on function public.fetch_manual_project_candidates_page(uuid, integer, integer, boolean, text, text) to authenticated;
grant execute on function public.fetch_manual_project_candidates_page(uuid, integer, integer, boolean, text, text) to anon;

notify pgrst, 'reload schema';
