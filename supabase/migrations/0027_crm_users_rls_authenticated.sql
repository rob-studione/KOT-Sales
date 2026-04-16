-- Fix crm_users RLS: authenticated users must be able to read crm_users.
-- Also remove unsafe anon access (was only for early MVP).

begin;

alter table public.crm_users enable row level security;

-- Remove legacy public/anon policies and privileges.
drop policy if exists "crm_users_select_public" on public.crm_users;
drop policy if exists "crm_users_insert_public" on public.crm_users;
drop policy if exists "crm_users_update_public" on public.crm_users;

revoke all on table public.crm_users from anon;

-- Allow logged-in users to read crm_users (needed for role checks, owner pickers, etc.).
drop policy if exists "crm_users_select_authenticated" on public.crm_users;
create policy "crm_users_select_authenticated"
  on public.crm_users for select to authenticated using (true);

grant select on table public.crm_users to authenticated;

commit;

