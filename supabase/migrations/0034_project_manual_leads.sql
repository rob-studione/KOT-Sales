-- Rankiniai kandidatai (leadai) tik rankiniu projekto tipu — ne klientų lentelėje.

create table if not exists public.project_manual_leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  company_name text not null,
  company_code text null,
  email text null,
  phone text null,
  contact_name text null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists project_manual_leads_project_id_idx
  on public.project_manual_leads (project_id, created_at desc);

alter table public.project_manual_leads enable row level security;

drop policy if exists "project_manual_leads_select_authenticated" on public.project_manual_leads;
create policy "project_manual_leads_select_authenticated"
  on public.project_manual_leads for select to authenticated using (true);

drop policy if exists "project_manual_leads_insert_authenticated" on public.project_manual_leads;
create policy "project_manual_leads_insert_authenticated"
  on public.project_manual_leads for insert to authenticated with check (true);

drop policy if exists "project_manual_leads_update_authenticated" on public.project_manual_leads;
create policy "project_manual_leads_update_authenticated"
  on public.project_manual_leads for update to authenticated using (true) with check (true);

drop policy if exists "project_manual_leads_delete_authenticated" on public.project_manual_leads;
create policy "project_manual_leads_delete_authenticated"
  on public.project_manual_leads for delete to authenticated using (true);

grant select, insert, update, delete on public.project_manual_leads to authenticated;

notify pgrst, 'reload schema';
