-- Manager obligations strip: filter open work items by assignee + follow-up date.

create index if not exists project_work_items_assigned_next_action_date_idx
  on public.project_work_items (assigned_to, next_action_date)
  where next_action_date is not null;

notify pgrst, 'reload schema';
