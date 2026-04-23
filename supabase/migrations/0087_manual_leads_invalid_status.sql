-- Kandidatų (manual leads) validumo statusas: active / netinkamas.
-- Tikslas: „netinkami“ dingsta iš aktyvaus sąrašo, bet lieka DB.

alter table public.project_manual_leads
add column if not exists status text;

-- Default aktyviems (naujiems įrašams).
alter table public.project_manual_leads
alter column status set default 'active';

-- CHECK constraint idempotentiškai.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'project_manual_leads'
      and c.conname = 'project_manual_leads_status_check'
  ) then
    alter table public.project_manual_leads
    add constraint project_manual_leads_status_check
    check (status in ('active','netinkamas'));
  end if;
end $$;

notify pgrst, 'reload schema';

