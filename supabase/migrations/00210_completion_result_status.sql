-- Užbaigus į „Užbaigta“: result_status gali būti konkretūs užbaigimo kodai (ne tik „completed“).

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
      'neaktualus',
      'returned_to_candidates',
      'completion_sent_email',
      'completion_sent_commercial',
      'completion_relevant_as_needed',
      'completion_translations_not_relevant',
      'completion_other_provider'
    )
  );

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
          'neaktualus',
          'returned_to_candidates',
          'completion_sent_email',
          'completion_sent_commercial',
          'completion_relevant_as_needed',
          'completion_translations_not_relevant',
          'completion_other_provider'
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
