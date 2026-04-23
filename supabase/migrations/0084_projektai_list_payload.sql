-- Vienas round-trip: projektų sąrašas + work item count + tik savininkų crm_users (be email/role).

create or replace function public.projektai_list_payload()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ordered as (
    select
      p.id,
      p.name,
      p.description,
      p.filter_date_from,
      p.filter_date_to,
      p.min_order_count,
      p.inactivity_days,
      p.sort_option,
      p.status,
      p.created_at,
      p.sort_order,
      p.owner_user_id,
      p.deleted_at
    from public.projects p
    order by p.sort_order asc nulls last, p.created_at desc
  ),
  cnt as (
    select w.project_id, count(*)::bigint as item_count
    from public.project_work_items w
    inner join ordered o on o.id = w.project_id
    group by w.project_id
  )
  select jsonb_build_object(
    'projects',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'name', o.name,
            'description', o.description,
            'filter_date_from', o.filter_date_from,
            'filter_date_to', o.filter_date_to,
            'min_order_count', o.min_order_count,
            'inactivity_days', o.inactivity_days,
            'sort_option', o.sort_option,
            'status', o.status,
            'created_at', o.created_at,
            'sort_order', o.sort_order,
            'owner_user_id', o.owner_user_id,
            'deleted_at', o.deleted_at
          )
          order by o.sort_order asc nulls last, o.created_at desc
        )
        from ordered o
      ),
      '[]'::jsonb
    ),
    'counts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('project_id', c.project_id, 'item_count', c.item_count)
          order by c.project_id::text
        )
        from cnt c
      ),
      '[]'::jsonb
    ),
    'users',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'name', u.name,
            'avatar_url', u.avatar_url
          )
          order by u.name
        )
        from public.crm_users u
        where u.id in (
          select distinct o2.owner_user_id
          from ordered o2
          where o2.owner_user_id is not null
        )
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.projektai_list_payload() is
  'CRM /projektai: viename JSON grąžina projektus (su sort), work_items count pagal projektą, ir tik savininkų crm_users (id, name, avatar_url).';

grant execute on function public.projektai_list_payload() to authenticated;
grant execute on function public.projektai_list_payload() to anon;

notify pgrst, 'reload schema';
