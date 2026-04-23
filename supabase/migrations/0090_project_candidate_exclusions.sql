-- Project-level exclusions for auto candidates (match_project_candidates).
-- Existence of a row = candidate is "netinkamas" for that project.

create table if not exists public.project_candidate_exclusions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  client_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_candidate_exclusions_unique unique (project_id, client_key)
);

create index if not exists project_candidate_exclusions_project_created_idx
  on public.project_candidate_exclusions (project_id, created_at desc);

create index if not exists project_candidate_exclusions_project_client_idx
  on public.project_candidate_exclusions (project_id, client_key);

alter table public.project_candidate_exclusions enable row level security;

-- Follow CRM auth model: authenticated only (no anon grants).
drop policy if exists "project_candidate_exclusions_select_authenticated" on public.project_candidate_exclusions;
create policy "project_candidate_exclusions_select_authenticated"
  on public.project_candidate_exclusions for select to authenticated using (true);

drop policy if exists "project_candidate_exclusions_insert_authenticated" on public.project_candidate_exclusions;
create policy "project_candidate_exclusions_insert_authenticated"
  on public.project_candidate_exclusions for insert to authenticated with check (true);

drop policy if exists "project_candidate_exclusions_update_authenticated" on public.project_candidate_exclusions;
create policy "project_candidate_exclusions_update_authenticated"
  on public.project_candidate_exclusions for update to authenticated using (true) with check (true);

drop policy if exists "project_candidate_exclusions_delete_authenticated" on public.project_candidate_exclusions;
create policy "project_candidate_exclusions_delete_authenticated"
  on public.project_candidate_exclusions for delete to authenticated using (true);

grant select, insert, update, delete on public.project_candidate_exclusions to authenticated;

-- ---------------------------------------------------------------------------
-- match_project_candidates: exclude candidates present in project_candidate_exclusions
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
  with filtered_all as (
    select *
    from public.invoices i
    where i.invoice_number ilike 'VK-000%'
      and i.invoice_number not ilike 'VK-000IS%'
      and i.invoice_number not ilike 'VK-000KR%'
  ),
  hist_inv as (
    select *
    from filtered_all i
    where i.invoice_date >= p_date_from
      and i.invoice_date <= p_date_to
  ),
  hist_agg as (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      count(*)::bigint as order_count,
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
    from filtered_all i
    group by 1
  ),
  global_rev as (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      sum(i.amount) as total_any
    from filtered_all i
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
      gr.total_any as total_revenue,
      h.last_invoice_date,
      gl.last_any
    from hist_agg h
    inner join hist_latest hl on hl.k = h.k
    inner join global_last gl on gl.k = h.k
    inner join global_rev gr on gr.k = h.k
    cross join inactivity_cutoff ic
    where gl.last_any < ic.d
  ),
  blocked as (
    select distinct w.client_key as ck
    from public.project_work_items w
    where p_project_id is not null
      and w.project_id = p_project_id
      and lower(trim(coalesce(w.result_status, ''))) <> 'returned_to_candidates'
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
  where b.ck is null
    and (
      p_project_id is null
      or not exists (
        select 1
        from public.project_candidate_exclusions e
        where e.project_id = p_project_id
          and e.client_key = q.client_key
      )
    );
$$;

grant execute on function public.match_project_candidates(date, date, integer, integer, uuid) to authenticated;

notify pgrst, 'reload schema';

