-- Enforce crm_users.role as a strict enum-like value.
-- Allowed: 'admin' | 'sales'
-- Default: 'sales'

begin;

-- Backfill legacy/nullable values before tightening constraints.
update public.crm_users
set role = 'sales'
where role is null
   or btrim(role) = ''
   or role = 'member';

alter table public.crm_users
  alter column role set default 'sales';

alter table public.crm_users
  alter column role set not null;

alter table public.crm_users
  drop constraint if exists crm_users_role_check;

alter table public.crm_users
  add constraint crm_users_role_check check (role in ('admin', 'sales'));

commit;

