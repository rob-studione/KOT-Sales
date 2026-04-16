-- Snapshot-based projects (worklists). Membership frozen at creation; only work_* fields change later.

create or replace function public.match_clients_for_project_snapshot(
  p_date_from date,
  p_date_to date,
  p_min_orders integer
)
returns table (
  client_key text,
  company_code text,
  client_id text,
  company_name text,
  order_count bigint,
  total_revenue numeric,
  last_invoice_date date
)
language sql
stable
as $$
  with inv as (
    select *
    from public.invoices i
    where i.invoice_date >= p_date_from
      and i.invoice_date <= p_date_to
  ),
  agg as (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      count(*)::bigint as order_count,
      sum(i.amount) as total_revenue,
      max(i.invoice_date)::date as last_invoice_date
    from inv i
    group by 1
    having count(*) >= greatest(p_min_orders, 1)
  ),
  latest as (
    select distinct on (coalesce(nullif(trim(i.company_code), ''), i.client_id, ''))
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      nullif(trim(i.company_code), '') as company_code,
      i.client_id,
      i.company_name
    from inv i
    order by coalesce(nullif(trim(i.company_code), ''), i.client_id, ''), i.invoice_date desc, i.invoice_id desc
  )
  select
    a.k as client_key,
    l.company_code,
    l.client_id,
    coalesce(nullif(trim(l.company_name), ''), '') as company_name,
    a.order_count,
    a.total_revenue,
    a.last_invoice_date
  from agg a
  inner join latest l on l.k = a.k;
$$;

grant execute on function public.match_clients_for_project_snapshot(date, date, integer) to anon;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  filter_date_from date not null,
  filter_date_to date not null,
  min_order_count integer not null default 1,
  sort_option text not null,
  snapshot_client_count integer not null,
  snapshot_total_revenue numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  created_by text null,
  constraint projects_status_check check (status in ('active', 'archived'))
);

create index if not exists projects_created_at_idx on public.projects (created_at desc);
create index if not exists projects_status_idx on public.projects (status);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  client_key text not null,
  client_identifier_display text not null,
  client_name_snapshot text not null,
  snapshot_order_count integer not null,
  snapshot_revenue numeric not null,
  snapshot_last_invoice_date date not null,
  snapshot_priority integer not null,
  call_status text not null default '',
  next_action text not null default '',
  next_action_date date null,
  comment text not null default '',
  owner text not null default '',
  work_updated_at timestamptz null,
  constraint project_members_priority_unique unique (project_id, snapshot_priority)
);

create index if not exists project_members_project_id_idx on public.project_members (project_id);
create index if not exists project_members_project_priority_idx on public.project_members (project_id, snapshot_priority);

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

drop policy if exists "projects_select_public" on public.projects;
create policy "projects_select_public"
  on public.projects for select to anon using (true);

drop policy if exists "projects_insert_public" on public.projects;
create policy "projects_insert_public"
  on public.projects for insert to anon with check (true);

drop policy if exists "projects_update_public" on public.projects;
create policy "projects_update_public"
  on public.projects for update to anon using (true) with check (true);

drop policy if exists "projects_delete_public" on public.projects;
create policy "projects_delete_public"
  on public.projects for delete to anon using (true);

drop policy if exists "project_members_select_public" on public.project_members;
create policy "project_members_select_public"
  on public.project_members for select to anon using (true);

drop policy if exists "project_members_insert_public" on public.project_members;
create policy "project_members_insert_public"
  on public.project_members for insert to anon with check (true);

drop policy if exists "project_members_update_public" on public.project_members;
create policy "project_members_update_public"
  on public.project_members for update to anon using (true) with check (true);

grant select, insert, update, delete on public.projects to anon;
grant select, insert, update on public.project_members to anon;
