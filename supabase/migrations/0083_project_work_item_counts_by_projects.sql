-- Vienas agregatas vietoj PostgREST nested `project_work_items(count)` per kiekvieną projektą.

create or replace function public.project_work_item_counts_by_projects(p_project_ids uuid[])
returns table (project_id uuid, item_count bigint)
language sql
stable
as $$
  select w.project_id, count(*)::bigint as item_count
  from public.project_work_items w
  where p_project_ids is not null
    and cardinality(p_project_ids) > 0
    and w.project_id = any (p_project_ids)
  group by w.project_id;
$$;

grant execute on function public.project_work_item_counts_by_projects(uuid[]) to anon;

notify pgrst, 'reload schema';
