-- Project-level filter: only keep business-like candidates.
-- Candidate is kept when company_code or vat_code is present.

alter table public.projects
  add column if not exists candidates_require_business_id boolean not null default false;

drop function if exists public.match_project_candidates(date, date, integer, integer, uuid);
drop function if exists public.match_project_candidates(date, date, integer, integer, uuid, boolean);

create or replace function public.match_project_candidates(
  p_date_from date,
  p_date_to date,
  p_min_orders integer,
  p_inactivity_days integer,
  p_project_id uuid default null,
  p_require_business_id boolean default false
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
      i.company_name,
      nullif(trim(i.vat_code), '') as vat_code
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
      hl.vat_code,
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
    )
    and (
      not p_require_business_id
      or nullif(trim(coalesce(q.company_code, '')), '') is not null
      or nullif(trim(coalesce(q.vat_code, '')), '') is not null
    );
$$;

grant execute on function public.match_project_candidates(date, date, integer, integer, uuid, boolean) to authenticated;

drop function if exists public.match_project_candidate_for_pick(uuid, date, date, integer, integer, text);
drop function if exists public.match_project_candidate_for_pick(uuid, date, date, integer, integer, text, boolean);

create or replace function public.match_project_candidate_for_pick(
  p_project_id uuid,
  p_date_from date,
  p_date_to date,
  p_min_orders integer,
  p_inactivity_days integer,
  p_client_key text,
  p_require_business_id boolean default false
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
  with ck as (
    select trim(coalesce(p_client_key, '')) as v
  ),
  filtered_all as (
    select i.*
    from public.invoices i
    cross join ck
    where ck.v <> ''
      and i.invoice_number ilike 'VK-000%'
      and i.invoice_number not ilike 'VK-000IS%'
      and i.invoice_number not ilike 'VK-000KR%'
      and coalesce(nullif(trim(i.company_code), ''), i.client_id, '') = ck.v
  ),
  hist_inv as (
    select i.*
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
      i.company_name,
      nullif(trim(i.vat_code), '') as vat_code
    from hist_inv i
    order by coalesce(nullif(trim(i.company_code), ''), i.client_id, ''), i.invoice_date desc, i.invoice_id desc
  ),
  global_last as (
    select max(i.invoice_date)::date as last_any
    from filtered_all i
  ),
  global_rev as (
    select coalesce(sum(i.amount), 0) as total_any
    from filtered_all i
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
      hl.vat_code,
      h.order_count,
      gr.total_any as total_revenue,
      h.last_invoice_date,
      gl.last_any
    from hist_agg h
    inner join hist_latest hl on hl.k = h.k
    cross join global_last gl
    cross join global_rev gr
    cross join inactivity_cutoff ic
    where gl.last_any < ic.d
  ),
  blocked as (
    select distinct w.client_key as bk
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
  cross join ck
  where ck.v <> ''
    and q.client_key = ck.v
    and not exists (select 1 from blocked b where b.bk = q.client_key)
    and not exists (
      select 1
      from public.project_candidate_exclusions e
      where e.project_id = p_project_id
        and e.client_key = q.client_key
    )
    and (
      not p_require_business_id
      or nullif(trim(coalesce(q.company_code, '')), '') is not null
      or nullif(trim(coalesce(q.vat_code, '')), '') is not null
    );
$$;

grant execute on function public.match_project_candidate_for_pick(uuid, date, date, integer, integer, text, boolean) to authenticated;

-- Enable for the current "Pavogti klientai" project.
update public.projects
set candidates_require_business_id = true
where id = '24239d13-215b-412b-b8b2-e48b1adafca6';

notify pgrst, 'reload schema';
