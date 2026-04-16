-- Centralizuoti CRM pranešimai (viešieji pirkimai ir kt.). Cron rašo per service_role.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.crm_users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  contract_id uuid not null references public.project_procurement_contracts (id) on delete cascade,
  type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in ('procurement_deadline'))
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where is_read = false;

create index if not exists notifications_project_created_idx
  on public.notifications (project_id, created_at desc);

comment on table public.notifications is
  'In-app pranešimai vartotojams; įrašus kuria serverio cron / job, ne UI.';

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;

-- Cron (Supabase service role) įrašo naujus pranešimus.
grant insert, select, update, delete on public.notifications to service_role;
