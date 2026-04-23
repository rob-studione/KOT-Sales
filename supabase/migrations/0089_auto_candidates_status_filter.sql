-- Auto kandidatų „Netinkami“ filtras:
-- - match_project_candidates gauna papildomą parametrą p_candidate_status (active / netinkamas)
-- - match_project_candidate_for_pick visada blokuoja netinkamus (negali būti paimti į „Darbas“)

drop function if exists public.match_project_candidates(date, date, integer, integer, uuid);

create or replace function public.match_project_candidates(
  p_date_from date,
  p_date_to date,
  p_min_orders integer,
  p_inactivity_days integer,
  p_project_id uuid default null,
  p_candidate_status text default null
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
  with
  params as (
    select nullif(btrim(coalesce(p_candidate_status, '')), '') as cst
  ),
  filtered_all as (
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
  ),
  status_map as (
    select s.client_key, s.status
    from public.project_candidate_statuses s
    where p_project_id is not null
      and s.project_id = p_project_id
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
  left join status_map sm on sm.client_key = q.client_key
  cross join params p
  where b.ck is null
    and (
      p_project_id is null
      or p.cst is null
      or p.cst = 'active' and (sm.status is null or sm.status = 'active')
      or p.cst = 'netinkamas' and sm.status = 'netinkamas'
    );
$$;

grant execute on function public.match_project_candidates(date, date, integer, integer, uuid, text) to anon;

-- Extra safety: pick RPC niekada neleis paimti „netinkamo“ kliento.
create or replace function public.match_project_candidate_for_pick(
  p_project_id uuid,
  p_date_from date,
  p_date_to date,
  p_min_orders integer,
  p_inactivity_days integer,
  p_client_key text
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
      i.company_name
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
  ),
  invalid as (
    select 1 as x
    from public.project_candidate_statuses s
    cross join ck
    where p_project_id is not null
      and ck.v <> ''
      and s.project_id = p_project_id
      and s.client_key = ck.v
      and s.status = 'netinkamas'
    limit 1
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
    and not exists (select 1 from invalid);
$$;

grant execute on function public.match_project_candidate_for_pick(uuid, date, date, integer, integer, text) to anon;

notify pgrst, 'reload schema';

