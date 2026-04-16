-- CALL_WORK Kanban: legacy call_status → nauji stulpeliai; veiksmo tipas `commercial` istorijai.

-- ---------------------------------------------------------------------------
-- 1) action_type CHECK: įtraukti `commercial` (el. laiškas / komercinis — ne KPI skambutis)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  if to_regclass('public.project_work_item_activities') is null then
    raise notice 'Skip 0018 activities: table missing';
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
      check (action_type in ('call', 'email', 'note', 'status_change', 'picked', 'commercial'))
  $c$;

  execute 'notify pgrst, ''reload schema''';
end $$;

-- ---------------------------------------------------------------------------
-- 2) project_work_items.call_status → fiksuoti Kanban stulpeliai
-- ---------------------------------------------------------------------------
update public.project_work_items
set call_status = 'Skambinti'
where trim(coalesce(call_status, '')) in ('', 'Neatsiliepė');

update public.project_work_items
set call_status = 'Perskambinti'
where trim(call_status) = 'Perskambins';

update public.project_work_items
set call_status = 'Laukti'
where trim(call_status) in ('Susisiekti vėliau', 'Aktualu pagal poreikį');

-- Neatpažinti seni tekstai → saugus numatytasis
update public.project_work_items
set call_status = 'Skambinti'
where trim(coalesce(call_status, '')) <> ''
  and call_status not in (
    'Skambinti',
    'Perskambinti',
    'Laukti',
    'Siųsti laišką',
    'Siųsti komercinį',
    'Skubus veiksmas',
    'Užbaigta'
  );
