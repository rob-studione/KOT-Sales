-- Jei 0051 nebuvo pilnai pritaikyta arba PostgREST „schema cache“ vis dar klaidingas:
-- pakartotinai užtikriname stulpelį, CHECK ir perkrauname PostgREST.

begin;

alter table public.projects
  add column if not exists procurement_notify_days_before integer null;

comment on column public.projects.procurement_notify_days_before is
  'Numatytasis „pranešti prieš X dienų“ viešųjų pirkimų sutartims (importe).';

alter table public.projects
  drop constraint if exists projects_project_type_check;

alter table public.projects
  add constraint projects_project_type_check check (project_type in ('automatic', 'manual', 'procurement'));

notify pgrst, 'reload schema';

commit;
