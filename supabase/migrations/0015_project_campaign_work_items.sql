-- Campaign model: project = rules; candidates = live query; work items = fixed rows after pick.

-- ---------------------------------------------------------------------------
-- projects: inactivity rule; remove upfront snapshot totals
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists inactivity_days integer;

update public.projects
set inactivity_days = 90
where inactivity_days is null;

alter table public.projects
  alter column inactivity_days set not null;

alter table public.projects
  alter column inactivity_days set default 90;

alter table public.projects
  drop column if exists snapshot_client_count;

alter table public.projects
  drop column if exists snapshot_total_revenue;

-- ---------------------------------------------------------------------------
-- project_work_items (replaces project_members)
-- ---------------------------------------------------------------------------
create table if not exists public.project_work_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  client_key text not null,
  client_identifier_display text not null,
  client_name_snapshot text not null,
  assigned_to text not null default '',
  picked_at timestamptz not null default now(),
  snapshot_order_count integer not null,
  snapshot_revenue numeric not null,
  snapshot_last_invoice_date date not null,
  snapshot_priority integer not null,
  call_status text not null default '',
  next_action text not null default '',
  next_action_date date null,
  comment text not null default '',
  result_status text not null default '',
  work_updated_at timestamptz null
);

create index if not exists project_work_items_project_id_idx on public.project_work_items (project_id);
create index if not exists project_work_items_project_picked_idx on public.project_work_items (project_id, picked_at desc);

drop index if exists public.project_work_items_one_open_client;
create unique index project_work_items_one_open_client
  on public.project_work_items (project_id, client_key)
  where not (
    lower(trim(coalesce(result_status, ''))) in (
      'completed',
      'closed',
      'cancelled',
      'uždaryta',
      'lost',
      'neaktualus'
    )
  );

do $$
begin
  if to_regclass('public.project_members') is not null then
    insert into public.project_work_items (
      id,
      project_id,
      client_key,
      client_identifier_display,
      client_name_snapshot,
      assigned_to,
      picked_at,
      snapshot_order_count,
      snapshot_revenue,
      snapshot_last_invoice_date,
      snapshot_priority,
      call_status,
      next_action,
      next_action_date,
      comment,
      result_status,
      work_updated_at
    )
    select
      pm.id,
      pm.project_id,
      pm.client_key,
      pm.client_identifier_display,
      pm.client_name_snapshot,
      coalesce(nullif(trim(pm.owner), ''), '—'),
      coalesce(pm.work_updated_at, p.created_at, now()),
      pm.snapshot_order_count,
      pm.snapshot_revenue,
      pm.snapshot_last_invoice_date,
      pm.snapshot_priority,
      pm.call_status,
      pm.next_action,
      pm.next_action_date,
      pm.comment,
      '',
      pm.work_updated_at
    from public.project_members pm
    inner join public.projects p on p.id = pm.project_id
    on conflict (id) do nothing;
  end if;
end $$;

drop table if exists public.project_members cascade;

alter table public.project_work_items enable row level security;

drop policy if exists "project_work_items_select_public" on public.project_work_items;
create policy "project_work_items_select_public"
  on public.project_work_items for select to anon using (true);

drop policy if exists "project_work_items_insert_public" on public.project_work_items;
create policy "project_work_items_insert_public"
  on public.project_work_items for insert to anon with check (true);

drop policy if exists "project_work_items_update_public" on public.project_work_items;
create policy "project_work_items_update_public"
  on public.project_work_items for update to anon using (true) with check (true);

grant select, insert, update on public.project_work_items to anon;

-- ---------------------------------------------------------------------------
-- Dynamic candidates (historical + inactivity + not blocked by open work item)
-- ---------------------------------------------------------------------------
create or replace function public.match_project_candidates(
  p_date_from date,
  p_date_to date,
  p_min_orders integer,
  p_inactivity_days integer,
  p_project_id uuid default null
)
returns table (
  client_key text,
  company_code text,
  client_id text,
  company_name text,
  order_count bigint,
  total_revenue numeric,
  last_invoice_date date,
  last_invoice_anywhere date
)
language sql
stable
as $$
  with hist_inv as (
    select *
    from public.invoices i
    where i.invoice_date >= p_date_from
      and i.invoice_date <= p_date_to
  ),
  hist_agg as (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      count(*)::bigint as order_count,
      sum(i.amount) as total_revenue,
      max(i.invoice_date)::date as last_invoice_date
    from hist_inv i
    group by 1
    having count(*) >= greatest(p_min_orders, 1)
  ),
  hist_latest as (
    select distinct on (coalesce(nullif(trim(i.company_code), ''), i.client_id, ''))
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      nullif(trim(i.company_code), '') as company_code,
      i.client_id,
      i.company_name
    from hist_inv i
    order by coalesce(nullif(trim(i.company_code), ''), i.client_id, ''), i.invoice_date desc, i.invoice_id desc
  ),
  global_last as (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      max(i.invoice_date)::date as last_any
    from public.invoices i
    group by 1
  ),
  inactivity_cutoff as (
    select (current_date - p_inactivity_days) as d
  ),
  qualified as (
    select
      h.k as client_key,
      hl.company_code,
      hl.client_id,
      coalesce(nullif(trim(hl.company_name), ''), '') as company_name,
      h.order_count,
      h.total_revenue,
      h.last_invoice_date,
      gl.last_any
    from hist_agg h
    inner join hist_latest hl on hl.k = h.k
    inner join global_last gl on gl.k = h.k
    cross join inactivity_cutoff ic
    where gl.last_any < ic.d
  ),
  blocked as (
    select distinct w.client_key as ck
    from public.project_work_items w
    where p_project_id is not null
      and w.project_id = p_project_id
      and not (
        lower(trim(coalesce(w.result_status, ''))) in (
          'completed',
          'closed',
          'cancelled',
          'uždaryta',
          'lost',
          'neaktualus'
        )
      )
  )
  select
    q.client_key,
    q.company_code,
    q.client_id,
    q.company_name,
    q.order_count,
    q.total_revenue,
    q.last_invoice_date,
    q.last_any as last_invoice_anywhere
  from qualified q
  left join blocked b on b.ck = q.client_key
  where b.ck is null;
$$;

grant execute on function public.match_project_candidates(date, date, integer, integer, uuid) to anon;
