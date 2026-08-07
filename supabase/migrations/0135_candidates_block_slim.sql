-- Siauresnis business-id blocking: nebeplečiame į visus client_id pagal kodą
-- (tai pūsdavo blocked iki ~7k ir lėtindavo anti-join).
-- Pakanka: work keys + company_code/vat iš sąskaitų pagal work client_id.

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
security definer
set search_path = public
set statement_timeout = '30s'
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
      nullif(trim(coalesce(p_search, '')), '') as v_search,
      (current_date - greatest(coalesce(p_inactivity_days, 90), 1)) as inactivity_cutoff,
      greatest(coalesce(p_min_orders, 1), 1) as min_orders
  ),
  base as (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      nullif(trim(i.company_code), '') as company_code,
      i.client_id,
      i.company_name,
      nullif(trim(i.vat_code), '') as vat_code,
      i.invoice_date,
      i.invoice_id,
      i.amount,
      (i.invoice_date >= p_date_from and i.invoice_date <= p_date_to) as in_hist
    from public.invoices i
    where i.invoice_number like 'VK-000%'
      and i.invoice_number not like 'VK-000IS%'
      and i.invoice_number not like 'VK-000KR%'
  ),
  agg as (
    select
      b.k,
      count(*) filter (where b.in_hist)::bigint as order_count,
      max(b.invoice_date) filter (where b.in_hist) as last_invoice_date,
      max(b.invoice_date)::date as last_any,
      coalesce(sum(b.amount), 0) as total_any
    from base b
    cross join params p
    group by b.k
    having count(*) filter (where b.in_hist) >= (select min_orders from params)
       and max(b.invoice_date) < (select inactivity_cutoff from params)
  ),
  hist_latest as (
    select distinct on (b.k)
      b.k,
      b.company_code,
      b.client_id,
      b.company_name,
      b.vat_code
    from base b
    where b.in_hist
    order by b.k, b.invoice_date desc, b.invoice_id desc
  ),
  active_work_ids as (
    select distinct id
    from (
      select nullif(trim(w.client_key), '') as id
      from public.project_work_items w
      where p_project_id is not null
        and w.project_id = p_project_id
        and lower(trim(coalesce(w.result_status, ''))) <> 'returned_to_candidates'
      union all
      select nullif(trim(w.client_identifier_display), '')
      from public.project_work_items w
      where p_project_id is not null
        and w.project_id = p_project_id
        and lower(trim(coalesce(w.result_status, ''))) <> 'returned_to_candidates'
        and nullif(trim(w.client_identifier_display), '') is not null
        and trim(w.client_identifier_display) not ilike 'PERSON_%'
    ) s
    where id is not null
  ),
  -- Tik: work client_id → company_code / vat (indeksas invoices_client_id_idx).
  work_business_ids as (
    select distinct x.id
    from (
      select nullif(trim(i.company_code), '') as id
      from public.invoices i
      where p_project_id is not null
        and i.client_id in (select id from active_work_ids)
        and i.invoice_number like 'VK-000%'
        and i.invoice_number not like 'VK-000IS%'
        and i.invoice_number not like 'VK-000KR%'
        and nullif(trim(i.company_code), '') is not null
        and trim(i.company_code) not ilike 'PERSON_%'
      union all
      select nullif(trim(i.vat_code), '')
      from public.invoices i
      where p_project_id is not null
        and i.client_id in (select id from active_work_ids)
        and i.invoice_number like 'VK-000%'
        and i.invoice_number not like 'VK-000IS%'
        and i.invoice_number not like 'VK-000KR%'
        and nullif(trim(i.vat_code), '') is not null
        and trim(i.vat_code) not ilike 'PERSON_%'
    ) x
    where x.id is not null
  ),
  blocked as (
    select id as ck from active_work_ids
    union
    select id from work_business_ids
  ),
  matched as (
    select
      a.k as client_key,
      hl.company_code,
      hl.client_id,
      coalesce(nullif(trim(hl.company_name), ''), '') as company_name,
      a.order_count,
      a.total_any as total_revenue,
      a.last_invoice_date::date as last_invoice_date,
      a.last_any as last_invoice_anywhere
    from agg a
    inner join hist_latest hl on hl.k = a.k
    cross join params p
    where not exists (
      select 1
      from blocked b
      where b.ck = a.k
         or (hl.company_code is not null and b.ck = hl.company_code)
         or (hl.vat_code is not null and b.ck = hl.vat_code)
         or (hl.client_id is not null and b.ck = hl.client_id)
    )
      and (
        p_project_id is null
        or not exists (
          select 1
          from public.project_candidate_exclusions e
          where e.project_id = p_project_id
            and e.client_key = a.k
        )
      )
      and (
        not p_require_business_id
        or nullif(trim(coalesce(hl.company_code, '')), '') is not null
        or nullif(trim(coalesce(hl.vat_code, '')), '') is not null
      )
      and (
        p.v_search is null
        or coalesce(nullif(trim(hl.company_name), ''), '') ilike '%' || p.v_search || '%'
        or coalesce(hl.company_code, '') ilike '%' || p.v_search || '%'
        or coalesce(hl.client_id, '') ilike '%' || p.v_search || '%'
        or a.k ilike '%' || p.v_search || '%'
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
  )
  select jsonb_build_object(
    'total_count', (select cnt from counted),
    'items', coalesce(
      (
        select jsonb_agg(
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
        )
        from ordered o
      ),
      '[]'::jsonb
    )
  );
$$;

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
security definer
set search_path = public
set statement_timeout = '30s'
as $$
  with filtered_all as (
    select *
    from public.invoices i
    where i.invoice_number like 'VK-000%'
      and i.invoice_number not like 'VK-000IS%'
      and i.invoice_number not like 'VK-000KR%'
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
    select (current_date - greatest(coalesce(p_inactivity_days, 90), 1)) as d
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
  active_work_ids as (
    select distinct id
    from (
      select nullif(trim(w.client_key), '') as id
      from public.project_work_items w
      where p_project_id is not null
        and w.project_id = p_project_id
        and lower(trim(coalesce(w.result_status, ''))) <> 'returned_to_candidates'
      union all
      select nullif(trim(w.client_identifier_display), '')
      from public.project_work_items w
      where p_project_id is not null
        and w.project_id = p_project_id
        and lower(trim(coalesce(w.result_status, ''))) <> 'returned_to_candidates'
        and nullif(trim(w.client_identifier_display), '') is not null
        and trim(w.client_identifier_display) not ilike 'PERSON_%'
    ) s
    where id is not null
  ),
  work_business_ids as (
    select distinct x.id
    from (
      select nullif(trim(i.company_code), '') as id
      from public.invoices i
      where p_project_id is not null
        and i.client_id in (select id from active_work_ids)
        and i.invoice_number like 'VK-000%'
        and i.invoice_number not like 'VK-000IS%'
        and i.invoice_number not like 'VK-000KR%'
        and nullif(trim(i.company_code), '') is not null
        and trim(i.company_code) not ilike 'PERSON_%'
      union all
      select nullif(trim(i.vat_code), '')
      from public.invoices i
      where p_project_id is not null
        and i.client_id in (select id from active_work_ids)
        and i.invoice_number like 'VK-000%'
        and i.invoice_number not like 'VK-000IS%'
        and i.invoice_number not like 'VK-000KR%'
        and nullif(trim(i.vat_code), '') is not null
        and trim(i.vat_code) not ilike 'PERSON_%'
    ) x
    where x.id is not null
  ),
  blocked as (
    select id as ck from active_work_ids
    union
    select id from work_business_ids
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
  where not exists (
      select 1
      from blocked b
      where b.ck = q.client_key
         or (q.company_code is not null and b.ck = q.company_code)
         or (q.vat_code is not null and b.ck = q.vat_code)
         or (q.client_id is not null and b.ck = q.client_id)
    )
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

revoke all on function public.match_project_candidates_page(
  date, date, integer, integer, uuid, boolean, text, integer, integer, text
) from public;

grant execute on function public.match_project_candidates_page(
  date, date, integer, integer, uuid, boolean, text, integer, integer, text
) to authenticated;

revoke all on function public.match_project_candidates(
  date, date, integer, integer, uuid, boolean
) from public;

grant execute on function public.match_project_candidates(
  date, date, integer, integer, uuid, boolean
) to authenticated;

notify pgrst, 'reload schema';
