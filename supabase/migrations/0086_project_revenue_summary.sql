-- Lightweight revenue summary for the "Pajamos" tab label and KPI.
-- Keeps /projektai/[id] initial load fast while enabling correct count without full feed.

create or replace function public.project_revenue_summary(
  p_project_id uuid,
  p_from date,
  p_to date
)
returns table (
  revenue_count bigint,
  direct_eur numeric,
  indirect_eur numeric,
  total_eur numeric
)
language sql
stable
set search_path = public
as $$
  with w as (
    select
      wi.id as work_item_id,
      trim(coalesce(wi.client_key, '')) as client_key
    from public.project_work_items wi
    where wi.project_id = p_project_id
  ),
  first_contact as (
    select
      a.work_item_id,
      min(a.occurred_at)::date as contact_date
    from public.project_work_item_activities a
    inner join w on w.work_item_id = a.work_item_id
    where lower(trim(coalesce(a.action_type, ''))) in ('call','email','commercial','note')
      and a.occurred_at::date >= p_from
      and a.occurred_at::date <= p_to
    group by a.work_item_id
  ),
  parts as (
    select
      w.work_item_id,
      nullif(trim(v.company_code), '') as company_code,
      nullif(trim(v.client_id), '') as client_id
    from w
    inner join public.v_client_list_from_invoices v on trim(coalesce(v.client_key, '')) = w.client_key
  ),
  inv as (
    select
      i.invoice_id,
      i.invoice_number,
      nullif(trim(i.company_code), '') as company_code,
      nullif(trim(i.client_id), '') as client_id,
      i.invoice_date::date as invoice_date,
      i.amount::numeric as amount
    from public.invoices i
    where i.series_title ilike 'VK-%'
      and i.invoice_number not ilike 'VK-000IS%'
      and i.invoice_number not ilike 'VK-000KR%'
      and i.invoice_date::date >= p_from
      and i.invoice_date::date <= p_to
  ),
  matches as (
    select
      inv.invoice_id,
      inv.invoice_date,
      inv.amount,
      fc.contact_date,
      (inv.invoice_date - fc.contact_date) as delta_days
    from inv
    inner join parts p on true
    inner join first_contact fc on fc.work_item_id = p.work_item_id
    where inv.invoice_date > fc.contact_date
      and (
        (p.company_code is not null and inv.company_code = p.company_code)
        or
        (p.company_code is null and p.client_id is not null and inv.company_code is null and inv.client_id = p.client_id)
        or
        (p.company_code is null and p.client_id is null and inv.company_code is null and inv.client_id is null)
      )
  ),
  picked as (
    -- Avoid double counting: pick the earliest contact that can explain the invoice.
    select distinct on (m.invoice_id)
      m.invoice_id,
      m.amount,
      m.delta_days
    from matches m
    order by m.invoice_id, m.contact_date asc
  )
  select
    count(*)::bigint as revenue_count,
    coalesce(sum(case when picked.delta_days <= 30 then picked.amount else 0 end), 0)::numeric as direct_eur,
    coalesce(sum(case when picked.delta_days > 30 then picked.amount else 0 end), 0)::numeric as indirect_eur,
    coalesce(sum(picked.amount), 0)::numeric as total_eur
  from picked;
$$;

comment on function public.project_revenue_summary(uuid, date, date) is
  'Lightweight revenue KPI/count for /projektai/[id] Pajamos tab. Computes distinct matched invoices count and direct/indirect/total sums without building full feed.';

grant execute on function public.project_revenue_summary(uuid, date, date) to anon;
grant execute on function public.project_revenue_summary(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';

