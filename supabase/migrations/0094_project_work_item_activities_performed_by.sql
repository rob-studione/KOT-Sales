-- Kas atliko veiksmą (KPI pagal tikrą atlikėją); seni įrašai lieka NULL.

alter table public.project_work_item_activities
  add column if not exists performed_by uuid null references public.crm_users (id) on delete set null;

comment on column public.project_work_item_activities.performed_by is
  'CRM naudotojas, kuris įrašė šį veiksmą; KPI naudoja coalesce(performed_by, work_item.assigned_to).';

create index if not exists project_work_item_activities_performed_by_idx
  on public.project_work_item_activities (performed_by);

notify pgrst, 'reload schema';
