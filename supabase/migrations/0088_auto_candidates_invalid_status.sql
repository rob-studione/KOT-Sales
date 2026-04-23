-- Auto kandidatų (match_project_candidates) statusas per mapping lentelę:
-- kad „netinkami“ dingtų iš aktyvaus sąrašo, bet liktų sistemoje.

create table if not exists public.project_candidate_statuses (
  project_id uuid not null references public.projects (id) on delete cascade,
  client_key text not null,
  status text not null default 'active',
  updated_at timestamptz not null default now(),
  primary key (project_id, client_key),
  constraint project_candidate_statuses_status_check check (status in ('active','netinkamas'))
);

create index if not exists project_candidate_statuses_project_status_idx
  on public.project_candidate_statuses (project_id, status);

-- RLS: kaip ir kitos CRM lentelės šiame projekte (public/anon access).
alter table public.project_candidate_statuses enable row level security;

drop policy if exists "project_candidate_statuses_select_public" on public.project_candidate_statuses;
create policy "project_candidate_statuses_select_public"
  on public.project_candidate_statuses for select to anon using (true);

drop policy if exists "project_candidate_statuses_upsert_public" on public.project_candidate_statuses;
create policy "project_candidate_statuses_upsert_public"
  on public.project_candidate_statuses for insert to anon with check (true);

drop policy if exists "project_candidate_statuses_update_public" on public.project_candidate_statuses;
create policy "project_candidate_statuses_update_public"
  on public.project_candidate_statuses for update to anon using (true) with check (true);

grant select, insert, update on public.project_candidate_statuses to anon;

notify pgrst, 'reload schema';

