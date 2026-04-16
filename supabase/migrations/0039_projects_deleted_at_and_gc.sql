-- Trash lifecycle: keep deleted projects 7 days, then purge automatically.
-- Adds `deleted_at`, sets it on transition to status='deleted', clears on restore.
-- If pg_cron is available, schedules daily purge job.

alter table public.projects
  add column if not exists deleted_at timestamptz null;

-- Backfill for any existing deleted rows (if feature was used before this migration).
update public.projects
set deleted_at = now()
where status = 'deleted' and deleted_at is null;

create index if not exists projects_deleted_at_idx on public.projects (deleted_at);

create or replace function public.projects_set_deleted_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'deleted' and (old.status is distinct from 'deleted') then
    new.deleted_at := now();
  elsif new.status is distinct from 'deleted' then
    new.deleted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_deleted_at on public.projects;
create trigger projects_set_deleted_at
  before update of status on public.projects
  for each row
  execute function public.projects_set_deleted_at();

create or replace function public.purge_deleted_projects()
returns integer
language plpgsql
as $$
declare
  n integer := 0;
begin
  delete from public.projects
  where status = 'deleted'
    and deleted_at is not null
    and deleted_at < (now() - interval '7 days');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Schedule daily purge if pg_cron exists (Supabase typically provides it on paid tiers).
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('purge_deleted_projects_daily');
    perform cron.schedule(
      'purge_deleted_projects_daily',
      '15 3 * * *',
      $$select public.purge_deleted_projects();$$
    );
  end if;
end $$;

notify pgrst, 'reload schema';

