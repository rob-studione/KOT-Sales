-- Esami CRM klientai (client_key) prijungti prie rankinio projekto — ne dubliuojama į project_manual_leads.

create table if not exists public.project_manual_linked_clients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  client_key text not null,
  created_at timestamptz not null default now(),
  constraint project_manual_linked_clients_project_client_unique unique (project_id, client_key)
);

create index if not exists project_manual_linked_clients_project_id_idx
  on public.project_manual_linked_clients (project_id, created_at desc);

alter table public.project_manual_linked_clients enable row level security;

drop policy if exists "project_manual_linked_clients_select_authenticated" on public.project_manual_linked_clients;
create policy "project_manual_linked_clients_select_authenticated"
  on public.project_manual_linked_clients for select to authenticated using (true);

drop policy if exists "project_manual_linked_clients_insert_authenticated" on public.project_manual_linked_clients;
create policy "project_manual_linked_clients_insert_authenticated"
  on public.project_manual_linked_clients for insert to authenticated with check (true);

drop policy if exists "project_manual_linked_clients_delete_authenticated" on public.project_manual_linked_clients;
create policy "project_manual_linked_clients_delete_authenticated"
  on public.project_manual_linked_clients for delete to authenticated using (true);

grant select, insert, delete on public.project_manual_linked_clients to authenticated;

notify pgrst, 'reload schema';
