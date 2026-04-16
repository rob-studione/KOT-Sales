-- Basic account system:
-- - crm_users linked to auth.users
-- - projects.owner_user_id references crm_users (nullable until first users exist)

do $$
begin
  if to_regclass('public.crm_users') is not null and to_regclass('public.crm_users_legacy') is null then
    alter table public.crm_users rename to crm_users_legacy;
  end if;
exception
  when undefined_table then
    -- ignore
end $$;

create table if not exists public.crm_users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'member',
  avatar_url text null,
  created_at timestamptz not null default now()
);

create index if not exists crm_users_role_idx on public.crm_users (role);
create index if not exists crm_users_created_at_idx on public.crm_users (created_at asc);

-- Ensure projects.owner_user_id can point to new crm_users and doesn't block migration.
alter table public.projects
  alter column owner_user_id drop not null;

do $$
begin
  -- Drop old FK if it exists (was pointing to legacy crm_users table).
  alter table public.projects drop constraint if exists projects_owner_user_id_fkey;
exception when undefined_table then
  -- ignore
end $$;

-- Existing projects might have owner_user_id values that point to legacy rows.
-- Until auth-linked users are created, clear the value to avoid FK violations.
update public.projects set owner_user_id = null where owner_user_id is not null;

alter table public.projects
  add constraint projects_owner_user_id_fkey
  foreign key (owner_user_id) references public.crm_users (id) on delete set null;

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

