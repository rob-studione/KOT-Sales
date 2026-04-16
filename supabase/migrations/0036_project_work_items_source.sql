-- Kilmė: automatinis kandidatas / rankinis lead / susietas klientas (diagnozė, ataskaitos).

alter table public.project_work_items
  add column if not exists source_type text null,
  add column if not exists source_id uuid null;

alter table public.project_work_items
  drop constraint if exists project_work_items_source_type_check;

alter table public.project_work_items
  add constraint project_work_items_source_type_check
  check (
    source_type is null
    or source_type in ('auto', 'manual_lead', 'linked_client')
  );

comment on column public.project_work_items.source_type is 'auto | manual_lead | linked_client';
comment on column public.project_work_items.source_id is 'Kandidato įrašo id (manual_lead / linked_client); auto — null.';

notify pgrst, 'reload schema';
