begin;

-- Generic key/value settings store (JSON values).
-- Keep RLS simple: authenticated users can read; only admins can write.

create table if not exists public.crm_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.crm_settings is 'Generic CRM settings as JSON key/value pairs.';

drop trigger if exists crm_settings_set_updated_at on public.crm_settings;
create or replace function public.crm_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_settings_set_updated_at
  before update on public.crm_settings
  for each row
  execute function public.crm_settings_touch_updated_at();

-- Lost QA defaults (safe idempotent inserts).
insert into public.crm_settings (key, value)
values
  ('lost_qa.enabled', 'true'::jsonb),
  ('lost_qa.mode', '"auto"'::jsonb),
  ('lost_qa.reanalyze_on_update', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.crm_settings enable row level security;

drop policy if exists "crm_settings_select_auth" on public.crm_settings;
create policy "crm_settings_select_auth"
  on public.crm_settings for select to authenticated
  using (true);

drop policy if exists "crm_settings_admin_insert" on public.crm_settings;
create policy "crm_settings_admin_insert"
  on public.crm_settings for insert to authenticated
  with check (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  );

drop policy if exists "crm_settings_admin_update" on public.crm_settings;
create policy "crm_settings_admin_update"
  on public.crm_settings for update to authenticated
  using (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  )
  with check (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  );

drop policy if exists "crm_settings_admin_delete" on public.crm_settings;
create policy "crm_settings_admin_delete"
  on public.crm_settings for delete to authenticated
  using (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  );

grant select on public.crm_settings to authenticated;
grant insert, update, delete on public.crm_settings to authenticated;

commit;
