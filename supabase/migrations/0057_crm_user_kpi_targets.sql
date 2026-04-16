-- Vadybininkų dienos KPI tikslai (vadovo dashboard).

create table if not exists public.crm_user_kpi_targets (
  user_id uuid primary key references public.crm_users (id) on delete cascade,
  daily_call_target integer not null default 30 check (daily_call_target >= 0),
  daily_answered_target integer not null default 10 check (daily_answered_target >= 0),
  daily_commercial_target integer not null default 5 check (daily_commercial_target >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.crm_user_kpi_targets is
  'Dienos skambučių / atsiliepusių / komercinių tikslai vadybininkui; KPI skalė = tikslas × kalendorinių dienų skaičius per laikotarpį.';

drop trigger if exists crm_user_kpi_targets_set_updated_at on public.crm_user_kpi_targets;
create or replace function public.crm_user_kpi_targets_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_user_kpi_targets_set_updated_at
  before update on public.crm_user_kpi_targets
  for each row
  execute function public.crm_user_kpi_targets_touch_updated_at();

alter table public.crm_user_kpi_targets enable row level security;

drop policy if exists "crm_user_kpi_targets_admin_select" on public.crm_user_kpi_targets;
create policy "crm_user_kpi_targets_admin_select"
  on public.crm_user_kpi_targets for select to authenticated
  using (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid())
        and u.role = 'admin'
    )
  );

drop policy if exists "crm_user_kpi_targets_admin_write" on public.crm_user_kpi_targets;
create policy "crm_user_kpi_targets_admin_write"
  on public.crm_user_kpi_targets for insert to authenticated
  with check (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid())
        and u.role = 'admin'
    )
  );

drop policy if exists "crm_user_kpi_targets_admin_update" on public.crm_user_kpi_targets;
create policy "crm_user_kpi_targets_admin_update"
  on public.crm_user_kpi_targets for update to authenticated
  using (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid())
        and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid())
        and u.role = 'admin'
    )
  );

drop policy if exists "crm_user_kpi_targets_admin_delete" on public.crm_user_kpi_targets;
create policy "crm_user_kpi_targets_admin_delete"
  on public.crm_user_kpi_targets for delete to authenticated
  using (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid())
        and u.role = 'admin'
    )
  );

grant select, insert, update, delete on public.crm_user_kpi_targets to authenticated;
