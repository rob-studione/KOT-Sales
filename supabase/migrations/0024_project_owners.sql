-- Projekto atsakingas asmuo (vienas CRM naudotojas per projektą).

create table if not exists public.crm_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  avatar_url text null,
  created_at timestamptz not null default now()
);

create index if not exists crm_users_created_at_idx on public.crm_users (created_at asc);

alter table public.projects
  add column if not exists owner_user_id uuid null references public.crm_users (id) on delete restrict;

-- Bent vienas naudotojas migracijos metu (egzistuojantiems projektams priskirti).
insert into public.crm_users (display_name)
select 'CRM'
where not exists (select 1 from public.crm_users limit 1);

update public.projects p
set owner_user_id = (select u.id from public.crm_users u order by u.created_at asc limit 1)
where p.owner_user_id is null;

alter table public.projects
  alter column owner_user_id set not null;

create index if not exists projects_owner_user_id_idx on public.projects (owner_user_id);

alter table public.crm_users enable row level security;

drop policy if exists "crm_users_select_public" on public.crm_users;
create policy "crm_users_select_public"
  on public.crm_users for select to anon using (true);

drop policy if exists "crm_users_insert_public" on public.crm_users;
create policy "crm_users_insert_public"
  on public.crm_users for insert to anon with check (true);

drop policy if exists "crm_users_update_public" on public.crm_users;
create policy "crm_users_update_public"
  on public.crm_users for update to anon using (true) with check (true);

grant select, insert, update on public.crm_users to anon;
