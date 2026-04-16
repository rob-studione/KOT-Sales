-- Remove cold_leads project type + related tables (cleanup).
-- Safe to run even if cold_leads was never applied.

-- If any projects still carry this type, normalize them to automatic.
update public.projects
set project_type = 'automatic'
where lower(trim(coalesce(project_type, ''))) = 'cold_leads';

-- Drop cold leads table if it exists.
drop table if exists public.project_cold_leads cascade;

-- Restore projects_project_type_check to only automatic/manual.
alter table public.projects
  drop constraint if exists projects_project_type_check;

alter table public.projects
  add constraint projects_project_type_check check (project_type in ('automatic', 'manual'));

notify pgrst, 'reload schema';

