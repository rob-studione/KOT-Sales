-- Pick vieno auto-kandidato: ta pati logika kaip match_project_candidates, bet tik vienam client_key
-- (žymiai mažiau skaitymo nei pilnas kandidatų sąrašas).

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
    and not exists (select 1 from blocked b where b.bk = q.client_key);
$$;

grant execute on function public.match_project_candidate_for_pick(uuid, date, date, integer, integer, text) to anon;

notify pgrst, 'reload schema';
