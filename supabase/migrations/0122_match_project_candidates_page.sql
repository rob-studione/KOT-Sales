-- Server-side puslapiavimas auto kandidatams (Kandidatai tab).
-- Ta pati filtravimo logika kaip match_project_candidates (0116), + sort / search / limit / offset.
-- Grąžina jsonb: { total_count, items: [...] } — prioritetų rank = offset + indeksas (1-based).

drop function if exists public.match_project_candidates_page(
  date, date, integer, integer, uuid, boolean, text, integer, integer, text
);

create or replace function public.match_project_candidates_page(
  p_date_from date,
  p_date_to date,
  p_min_orders integer,
  p_inactivity_days integer,
  p_project_id uuid default null,
  p_require_business_id boolean default false,
  p_sort text default 'revenue_desc',
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      case
        when lower(trim(coalesce(p_sort, ''))) = 'last_invoice_desc' then 'last_invoice_desc'
        when lower(trim(coalesce(p_sort, ''))) = 'order_count_desc' then 'order_count_desc'
        else 'revenue_desc'
      end as v_sort,
      least(greatest(coalesce(p_limit, 20), 1), 100) as v_limit,
      greatest(coalesce(p_offset, 0), 0) as v_offset,
      nullif(trim(coalesce(p_search, '')), '') as v_search
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
  ),
  matched as (
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
    cross join params p
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
      )
      and (
        p.v_search is null
        or q.company_name ilike '%' || p.v_search || '%'
        or coalesce(q.company_code, '') ilike '%' || p.v_search || '%'
        or coalesce(q.client_id, '') ilike '%' || p.v_search || '%'
        or q.client_key ilike '%' || p.v_search || '%'
      )
  ),
  counted as (
    select count(*)::bigint as cnt from matched
  ),
  ordered as (
    select m.*
    from matched m
    cross join params p
    order by
      case when p.v_sort = 'last_invoice_desc' then m.last_invoice_anywhere end desc nulls last,
      case when p.v_sort = 'order_count_desc' then m.order_count end desc nulls last,
      case when p.v_sort = 'revenue_desc' then m.total_revenue end desc nulls last,
      m.client_key asc
    limit (select v_limit from params)
    offset (select v_offset from params)
  ),
  items as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'client_key', o.client_key,
          'company_code', o.company_code,
          'client_id', o.client_id,
          'company_name', o.company_name,
          'order_count', o.order_count,
          'total_revenue', o.total_revenue,
          'last_invoice_date', o.last_invoice_date,
          'last_invoice_anywhere', o.last_invoice_anywhere
        )
        order by
          case when (select v_sort from params) = 'last_invoice_desc' then o.last_invoice_anywhere end desc nulls last,
          case when (select v_sort from params) = 'order_count_desc' then o.order_count end desc nulls last,
          case when (select v_sort from params) = 'revenue_desc' then o.total_revenue end desc nulls last,
          o.client_key asc
      ),
      '[]'::jsonb
    ) as arr
    from ordered o
  )
  select jsonb_build_object(
    'total_count', (select cnt from counted),
    'items', (select arr from items)
  );
$$;

grant execute on function public.match_project_candidates_page(
  date, date, integer, integer, uuid, boolean, text, integer, integer, text
) to authenticated;

notify pgrst, 'reload schema';
