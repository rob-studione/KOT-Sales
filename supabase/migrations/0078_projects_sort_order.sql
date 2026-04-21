-- Add manual sort order for projects (drag-and-drop ordering).
-- Backfill existing rows safely using current UI order (created_at DESC).

alter table public.projects
add column if not exists sort_order integer;

-- Backfill only rows missing sort_order.
with ordered as (
  select
    id,
    row_number() over (order by created_at desc, id asc) - 1 as rn
  from public.projects
  where sort_order is null
)
update public.projects p
set sort_order = o.rn
from ordered o
where p.id = o.id;

create index if not exists projects_sort_order_idx on public.projects (sort_order);

