-- Idempotent: užtikrinti `action_type` CHECK su `returned_to_candidates` (jei 0019 nebuvo pritaikyta
-- arba DB liko ties 0018 be šios reikšmės). Galima paleisti atskirai.

do $$
declare
  r record;
begin
  if to_regclass('public.project_work_item_activities') is null then
    raise notice 'Skip 0020: public.project_work_item_activities does not exist';
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
      check (
        action_type in (
          'call',
          'email',
          'note',
          'status_change',
          'picked',
          'commercial',
          'returned_to_candidates'
        )
      )
  $c$;

  execute 'notify pgrst, ''reload schema''';
end $$;
