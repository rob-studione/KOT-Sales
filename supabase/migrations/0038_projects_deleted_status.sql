-- Add soft-delete ("trash") lifecycle state for projects.
-- Active -> archived -> deleted (trash) -> hard delete (only when already deleted).

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check check (status in ('active', 'archived', 'deleted'));

notify pgrst, 'reload schema';

