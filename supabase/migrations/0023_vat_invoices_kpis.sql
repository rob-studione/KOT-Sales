-- KPI kortelėms /invoices: PVM sąskaitų (VK-%) skaičius ir bendra suma be PostgREST agregatų
-- (agregatai gali būti išjungti — žr. „Use of aggregate functions is not allowed“).

create or replace function public.vat_invoices_kpis()
returns table (
  invoice_count bigint,
  total_amount numeric
)
language sql
stable
as $$
  select
    count(*)::bigint,
    coalesce(sum(i.amount), 0)::numeric
  from public.invoices i
  where i.series_title ilike 'VK-%';
$$;

grant execute on function public.vat_invoices_kpis() to anon;
