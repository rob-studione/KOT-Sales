-- Project creation mode: automatic (RPC candidates) vs manual (empty until added by user).

alter table public.projects
  add column if not exists project_type text not null default 'automatic';

update public.projects
set project_type = 'automatic'
where project_type is null or trim(project_type) = '';

alter table public.projects
  drop constraint if exists projects_project_type_check;

alter table public.projects
  add constraint projects_project_type_check check (project_type in ('automatic', 'manual'));

-- PostgREST schema cache (Supabase API) — kitaip gali likti „schema cache“ klaida.
notify pgrst, 'reload schema';
