begin;

-- Roles + permission matrix for CRM RBAC.

create table if not exists public.crm_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text null,
  color text not null default '#7C4A57',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_roles is 'CRM roles with human label/color and system flag.';

create table if not exists public.crm_role_permissions (
  role_id uuid not null references public.crm_roles(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

comment on table public.crm_role_permissions is 'Role to permission key mapping.';

create index if not exists crm_role_permissions_permission_key_idx
  on public.crm_role_permissions(permission_key);

alter table public.crm_users
  add column if not exists role_id uuid null references public.crm_roles(id) on delete set null;

-- Keep role as legacy key string, but remove strict old enum constraint.
alter table public.crm_users
  drop constraint if exists crm_users_role_check;

-- Updated-at trigger for roles.
drop trigger if exists crm_roles_set_updated_at on public.crm_roles;
create or replace function public.crm_roles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_roles_set_updated_at
  before update on public.crm_roles
  for each row
  execute function public.crm_roles_touch_updated_at();

-- Seed system roles.
insert into public.crm_roles (key, name, description, color, is_system)
values
  ('admin', 'Administratorius', 'Pilna prieiga prie visų CRM funkcijų.', '#3b82f6', true),
  ('sales', 'Pardavimų vadybininkas', 'Kasdieniai pardavimų veiksmai be administravimo.', '#7C4A57', true)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    is_system = true;

-- Backfill users.role key + role_id.
update public.crm_users u
set role = coalesce(nullif(lower(trim(u.role)), ''), 'sales')
where u.role is null
   or btrim(u.role) = '';

-- Any unknown legacy key -> sales for safe fallback.
update public.crm_users u
set role = 'sales'
where lower(trim(u.role)) not in ('admin', 'sales');

update public.crm_users u
set role_id = r.id
from public.crm_roles r
where r.key = lower(trim(u.role))
  and (u.role_id is null or u.role_id <> r.id);

-- Ensure role_id always populated after seed/backfill.
update public.crm_users u
set role_id = (select id from public.crm_roles where key = 'sales')
where u.role_id is null;

alter table public.crm_users
  alter column role_id set not null;

-- Seed default permission keys for system roles.
with admin_role as (
  select id from public.crm_roles where key = 'admin'
), sales_role as (
  select id from public.crm_roles where key = 'sales'
)
insert into public.crm_role_permissions(role_id, permission_key)
select ar.id, p.permission_key
from admin_role ar
cross join (
  values
    ('nav.dashboard'),
    ('nav.analytics.kpi'),
    ('nav.analytics.lost_qa'),
    ('nav.clients'),
    ('nav.clients.invoices'),
    ('nav.projects'),
    ('nav.tools.playbooks'),
    ('nav.tools.translator_search'),
    ('nav.tools.podcasts'),
    ('nav.settings'),
    ('analytics.kpi.edit_targets'),
    ('tools.translator_search.run'),
    ('tools.translator_search.review'),
    ('tools.podcasts.refresh'),
    ('projects.create'),
    ('projects.manage'),
    ('settings.general'),
    ('settings.accounts'),
    ('settings.roles'),
    ('settings.lost_qa'),
    ('settings.podcasts_ai')
) as p(permission_key)
on conflict do nothing;

with sales_role as (
  select id from public.crm_roles where key = 'sales'
)
insert into public.crm_role_permissions(role_id, permission_key)
select sr.id, p.permission_key
from sales_role sr
cross join (
  values
    ('nav.dashboard'),
    ('nav.analytics.kpi'),
    ('nav.clients'),
    ('nav.clients.invoices'),
    ('nav.projects'),
    ('nav.tools.playbooks'),
    ('nav.tools.translator_search'),
    ('nav.tools.podcasts')
) as p(permission_key)
on conflict do nothing;

-- Permission helper for RLS/policies.
create or replace function public.crm_user_has_permission(
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_users u
    join public.crm_roles r on r.id = u.role_id
    left join public.crm_role_permissions rp on rp.role_id = r.id
    where u.id = p_user_id
      and (
        (r.is_system = true and r.key = 'admin')
        or rp.permission_key = p_permission_key
      )
  );
$$;

revoke all on function public.crm_user_has_permission(uuid, text) from public;
grant execute on function public.crm_user_has_permission(uuid, text) to authenticated;
grant execute on function public.crm_user_has_permission(uuid, text) to service_role;

-- Roles tables RLS.
alter table public.crm_roles enable row level security;
alter table public.crm_role_permissions enable row level security;

drop policy if exists "crm_roles_authenticated_select" on public.crm_roles;
create policy "crm_roles_authenticated_select"
  on public.crm_roles for select to authenticated
  using (true);

drop policy if exists "crm_role_permissions_authenticated_select" on public.crm_role_permissions;
create policy "crm_role_permissions_authenticated_select"
  on public.crm_role_permissions for select to authenticated
  using (true);

grant select on public.crm_roles to authenticated;
grant select on public.crm_role_permissions to authenticated;
grant all on public.crm_roles to service_role;
grant all on public.crm_role_permissions to service_role;

-- Rewrite admin-based policies to permission-based checks.

drop policy if exists "crm_global_settings_admin_update" on public.crm_global_settings;
create policy "crm_global_settings_admin_update"
  on public.crm_global_settings for update to authenticated
  using (public.crm_user_has_permission((select auth.uid()), 'settings.general'))
  with check (public.crm_user_has_permission((select auth.uid()), 'settings.general'));

drop policy if exists "crm_statuses_admin_write" on public.crm_statuses;
create policy "crm_statuses_admin_write"
  on public.crm_statuses for all to authenticated
  using (public.crm_user_has_permission((select auth.uid()), 'settings.general'))
  with check (public.crm_user_has_permission((select auth.uid()), 'settings.general'));

drop policy if exists "crm_settings_admin_insert" on public.crm_settings;
create policy "crm_settings_admin_insert"
  on public.crm_settings for insert to authenticated
  with check (
    public.crm_user_has_permission((select auth.uid()), 'settings.general')
    or public.crm_user_has_permission((select auth.uid()), 'settings.lost_qa')
    or public.crm_user_has_permission((select auth.uid()), 'settings.podcasts_ai')
  );

drop policy if exists "crm_settings_admin_update" on public.crm_settings;
create policy "crm_settings_admin_update"
  on public.crm_settings for update to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'settings.general')
    or public.crm_user_has_permission((select auth.uid()), 'settings.lost_qa')
    or public.crm_user_has_permission((select auth.uid()), 'settings.podcasts_ai')
  )
  with check (
    public.crm_user_has_permission((select auth.uid()), 'settings.general')
    or public.crm_user_has_permission((select auth.uid()), 'settings.lost_qa')
    or public.crm_user_has_permission((select auth.uid()), 'settings.podcasts_ai')
  );

drop policy if exists "crm_settings_admin_delete" on public.crm_settings;
create policy "crm_settings_admin_delete"
  on public.crm_settings for delete to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'settings.general')
    or public.crm_user_has_permission((select auth.uid()), 'settings.lost_qa')
    or public.crm_user_has_permission((select auth.uid()), 'settings.podcasts_ai')
  );

drop policy if exists "crm_user_kpi_targets_admin_write" on public.crm_user_kpi_targets;
create policy "crm_user_kpi_targets_admin_write"
  on public.crm_user_kpi_targets for insert to authenticated
  with check (public.crm_user_has_permission((select auth.uid()), 'analytics.kpi.edit_targets'));

drop policy if exists "crm_user_kpi_targets_admin_update" on public.crm_user_kpi_targets;
create policy "crm_user_kpi_targets_admin_update"
  on public.crm_user_kpi_targets for update to authenticated
  using (public.crm_user_has_permission((select auth.uid()), 'analytics.kpi.edit_targets'))
  with check (public.crm_user_has_permission((select auth.uid()), 'analytics.kpi.edit_targets'));

drop policy if exists "crm_user_kpi_targets_admin_delete" on public.crm_user_kpi_targets;
create policy "crm_user_kpi_targets_admin_delete"
  on public.crm_user_kpi_targets for delete to authenticated
  using (public.crm_user_has_permission((select auth.uid()), 'analytics.kpi.edit_targets'));

drop policy if exists "ai_usage_logs_admin_select" on public.ai_usage_logs;
create policy "ai_usage_logs_admin_select"
  on public.ai_usage_logs for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'settings.lost_qa')
    or public.crm_user_has_permission((select auth.uid()), 'settings.podcasts_ai')
    or public.crm_user_has_permission((select auth.uid()), 'nav.analytics.lost_qa')
  );

notify pgrst, 'reload schema';

commit;
