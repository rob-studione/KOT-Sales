-- Viena agregacija: pirmas kontaktas pagal darbo eilutę (analitikos KPI, be pilnos lentelės skaitymo).

create or replace function public.dashboard_first_contact_per_work_item()
returns table (
  work_item_id uuid,
  first_occurred_at timestamptz
)
language sql
stable
as $$
  select
    a.work_item_id,
    min(a.occurred_at) as first_occurred_at
  from public.project_work_item_activities a
  where a.action_type in ('call', 'email', 'commercial', 'note')
  group by a.work_item_id;
$$;

grant execute on function public.dashboard_first_contact_per_work_item() to anon;
