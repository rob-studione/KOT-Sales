-- Indexes for analytics queries on project_work_item_activities.
-- Goal: avoid seq scans + expensive sorts for occurred_at window queries.

do $$
begin
  if to_regclass('public.project_work_item_activities') is null then
    raise notice 'Skip 0022: public.project_work_item_activities does not exist';
    return;
  end if;
end $$;

-- Time-window fetch (occurred_at range + order by occurred_at asc/desc)
create index if not exists project_work_item_activities_occurred_at_idx
  on public.project_work_item_activities (occurred_at);

-- KPI / trend: action_type = 'call' AND occurred_at range
create index if not exists project_work_item_activities_action_type_occurred_at_idx
  on public.project_work_item_activities (action_type, occurred_at);

-- Make sure PostgREST schema cache reloads (helps new RPC visibility too)
notify pgrst, 'reload schema';

