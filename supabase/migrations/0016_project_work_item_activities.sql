-- Append-only activity log per work item (sheet-style history; current state still on project_work_items).

create table if not exists public.project_work_item_activities (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.project_work_items (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  action_type text not null default 'note'
    check (action_type in ('call', 'email', 'note', 'status_change', 'picked')),
  call_status text not null default '',
  next_action text not null default '',
  next_action_date date null,
  comment text not null default ''
);

create index if not exists project_work_item_activities_work_item_idx
  on public.project_work_item_activities (work_item_id, occurred_at desc);

alter table public.project_work_item_activities enable row level security;

drop policy if exists "project_work_item_activities_select_public" on public.project_work_item_activities;
create policy "project_work_item_activities_select_public"
  on public.project_work_item_activities for select to anon using (true);

drop policy if exists "project_work_item_activities_insert_public" on public.project_work_item_activities;
create policy "project_work_item_activities_insert_public"
  on public.project_work_item_activities for insert to anon with check (true);

grant select, insert on public.project_work_item_activities to anon;

-- One synthetic row per existing work item so timeline is never empty for old data.
insert into public.project_work_item_activities (
  work_item_id,
  occurred_at,
  action_type,
  call_status,
  next_action,
  next_action_date,
  comment
)
select
  w.id,
  coalesce(w.work_updated_at, w.picked_at),
  case
    when coalesce(trim(w.call_status), '') = ''
      and coalesce(trim(w.next_action), '') = ''
      and w.next_action_date is null
      and coalesce(trim(w.comment), '') = ''
    then 'picked'
    else 'note'
  end,
  coalesce(w.call_status, ''),
  coalesce(w.next_action, ''),
  w.next_action_date,
  coalesce(w.comment, '')
from public.project_work_items w
where not exists (
  select 1 from public.project_work_item_activities a where a.work_item_id = w.id
);
