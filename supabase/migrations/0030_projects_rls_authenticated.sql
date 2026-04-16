-- Ensure authenticated users can access projects.
-- Current state (legacy): projects policies exist only for anon.
-- CRM is behind login, so authenticated needs at least SELECT.

begin;

alter table public.projects enable row level security;

drop policy if exists "projects_select_authenticated" on public.projects;
create policy "projects_select_authenticated"
  on public.projects for select to authenticated using (true);

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_authenticated"
  on public.projects for insert to authenticated with check (true);

drop policy if exists "projects_update_authenticated" on public.projects;
create policy "projects_update_authenticated"
  on public.projects for update to authenticated using (true) with check (true);

drop policy if exists "projects_delete_authenticated" on public.projects;
create policy "projects_delete_authenticated"
  on public.projects for delete to authenticated using (true);

grant select, insert, update, delete on public.projects to authenticated;

commit;

