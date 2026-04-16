-- Ensure project_work_item_activities works with Kanban (status_change) + PostgREST.
-- Run after 0016 (npm run db:apply:work-item-activities runs both).
--
-- Fixes common production issues:
--   • CHECK on action_type missing 'status_change' (older / hand-edited schemas)
--   • RLS only on anon while some clients use role authenticated
--   • PostgREST schema cache stale after DDL (NOTIFY reload)

do $$
declare
  r record;
begin
  if to_regclass('public.project_work_item_activities') is null then
    raise notice 'Skip 0017: public.project_work_item_activities does not exist. Apply 0016 first.';
    return;
  end if;

  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.project_work_item_activities'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%action_type%'
  loop
    execute format('alter table public.project_work_item_activities drop constraint %I', r.conname);
  end loop;

  execute 'alter table public.project_work_item_activities drop constraint if exists project_work_item_activities_action_type_check';

  execute $c$
    alter table public.project_work_item_activities
      add constraint project_work_item_activities_action_type_check
      check (action_type in ('call', 'email', 'note', 'status_change', 'picked'))
  $c$;

  execute 'drop policy if exists "project_work_item_activities_select_authenticated" on public.project_work_item_activities';
  execute $p$
    create policy "project_work_item_activities_select_authenticated"
      on public.project_work_item_activities for select to authenticated using (true)
  $p$;

  execute 'drop policy if exists "project_work_item_activities_insert_authenticated" on public.project_work_item_activities';
  execute $p$
    create policy "project_work_item_activities_insert_authenticated"
      on public.project_work_item_activities for insert to authenticated with check (true)
  $p$;

  execute 'grant select, insert on public.project_work_item_activities to authenticated';
  execute 'notify pgrst, ''reload schema''';
end $$;
