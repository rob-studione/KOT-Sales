-- Lightweight count for "Kandidatai" tab label without returning full candidate rows.

create or replace function public.match_project_candidates_count(
  p_date_from date,
  p_date_to date,
  p_min_orders integer,
  p_inactivity_days integer,
  p_project_id uuid default null
)
returns bigint
language sql
stable
set search_path = public
as $$
  with filtered_all as (
    select i.invoice_id, i.invoice_date, i.amount, i.company_code, i.client_id
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
      count(*)::bigint as order_count
    from hist_inv i
    group by 1
    having count(*) >= greatest(p_min_orders, 1)
  ),
  global_last as (
    select
      coalesce(nullif(trim(i.company_code), ''), i.client_id, '') as k,
      max(i.invoice_date)::date as last_any
    from filtered_all i
    group by 1
  ),
  inactivity_cutoff as (
    select (current_date - p_inactivity_days) as d
  ),
  qualified as (
    select h.k
    from hist_agg h
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
  select count(*)::bigint
  from qualified q
  left join blocked b on b.ck = q.k
  where b.ck is null;
$$;

comment on function public.match_project_candidates_count(date, date, integer, integer, uuid) is
  'Count-only variant of match_project_candidates for Kandidatai tab label; avoids returning full rows.';

grant execute on function public.match_project_candidates_count(date, date, integer, integer, uuid) to anon;
grant execute on function public.match_project_candidates_count(date, date, integer, integer, uuid) to authenticated;

notify pgrst, 'reload schema';

