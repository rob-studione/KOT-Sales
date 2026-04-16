-- CRM global logic settings:
-- - call outcome/status mapping (answered / not answered / successful)
-- - KPI defaults (global)
-- - sales attribution rules (direct vs influenced) (stored as text/json for now)
-- - account-level timezone + language default

begin;

-- Global singleton settings (single-tenant for now).
create table if not exists public.crm_global_settings (
  id integer primary key default 1 check (id = 1),
  -- KPI defaults (global, can be used as fallbacks)
  daily_call_target integer not null default 30 check (daily_call_target >= 0),
  daily_answered_target integer not null default 10 check (daily_answered_target >= 0),
  -- Sales logic (keep simple, human-editable for now)
  sales_direct_rule text not null default 'invoice_date > first_call_date => direct',
  sales_influenced_rule text not null default 'if latest_status is "Aktualu pagal poreikį" => influenced',
  -- Display / reporting settings
  timezone text not null default 'Europe/Vilnius',
  language text not null default 'lt',
  updated_at timestamptz not null default now()
);

-- Ensure singleton row exists.
insert into public.crm_global_settings (id)
values (1)
on conflict (id) do nothing;

comment on table public.crm_global_settings is 'Global CRM settings (single-tenant). Extend to per-account later.';

drop trigger if exists crm_global_settings_set_updated_at on public.crm_global_settings;
create or replace function public.crm_global_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_global_settings_set_updated_at
  before update on public.crm_global_settings
  for each row
  execute function public.crm_global_settings_touch_updated_at();

-- Status / pipeline configuration (also drives analytics classification).
create table if not exists public.crm_statuses (
  key text primary key,
  sort_order integer not null default 0,
  is_answered boolean not null default false,
  is_not_answered boolean not null default false,
  is_success boolean not null default false,
  is_failure boolean not null default false,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.crm_statuses is 'Configurable status/pipeline list + analytics flags.';

drop trigger if exists crm_statuses_set_updated_at on public.crm_statuses;
create or replace function public.crm_statuses_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_statuses_set_updated_at
  before update on public.crm_statuses
  for each row
  execute function public.crm_statuses_touch_updated_at();

-- Seed defaults from current Kanban workflow (if empty).
insert into public.crm_statuses (key, sort_order, is_answered, is_not_answered, is_success)
select * from (
  values
    ('Skambinti', 10, false, true, false),
    ('Perskambinti', 20, false, true, false),
    ('Laukti', 30, true, false, false),
    ('Siųsti laišką', 40, true, false, false),
    ('Siųsti komercinį', 50, true, false, true),
    ('Skubus veiksmas', 60, true, false, false),
    ('Užbaigta', 70, true, false, true)
) as v(key, sort_order, is_answered, is_not_answered, is_success)
where not exists (select 1 from public.crm_statuses);

-- Per-user preferences (timezone/language).
alter table public.crm_users
  add column if not exists timezone text not null default 'Europe/Vilnius',
  add column if not exists language text not null default 'lt';

comment on column public.crm_users.timezone is 'Preferred display timezone (IANA, e.g. Europe/Vilnius). Stored timestamps remain UTC.';
comment on column public.crm_users.language is 'Preferred UI language (lt/en).';

-- RLS
alter table public.crm_global_settings enable row level security;
alter table public.crm_statuses enable row level security;

-- Global settings: admins can read/write, authenticated can read (for display).
drop policy if exists "crm_global_settings_select_auth" on public.crm_global_settings;
create policy "crm_global_settings_select_auth"
  on public.crm_global_settings for select to authenticated
  using (true);

drop policy if exists "crm_global_settings_admin_update" on public.crm_global_settings;
create policy "crm_global_settings_admin_update"
  on public.crm_global_settings for update to authenticated
  using (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  )
  with check (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  );

-- Statuses: admins manage, authenticated can read.
drop policy if exists "crm_statuses_select_auth" on public.crm_statuses;
create policy "crm_statuses_select_auth"
  on public.crm_statuses for select to authenticated
  using (true);

drop policy if exists "crm_statuses_admin_write" on public.crm_statuses;
create policy "crm_statuses_admin_write"
  on public.crm_statuses for all to authenticated
  using (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  )
  with check (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  );

-- crm_users: allow authenticated users to update own preferences.
-- (Existing policies may already allow broader updates; keep this as minimal additive.)
drop policy if exists "crm_users_update_self_prefs" on public.crm_users;
create policy "crm_users_update_self_prefs"
  on public.crm_users for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.crm_global_settings to authenticated;
grant update on public.crm_global_settings to authenticated;
grant select on public.crm_statuses to authenticated;
grant insert, update, delete on public.crm_statuses to authenticated;

commit;

