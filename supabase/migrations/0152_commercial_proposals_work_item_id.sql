-- Link commercial proposals to a Kanban work item (Express flow).
-- Existing rows stay work_item_id = null. Deleting a work item keeps the proposal.

begin;

alter table public.commercial_proposals
  add column if not exists work_item_id uuid null
  references public.project_work_items (id)
  on delete set null;

comment on column public.commercial_proposals.work_item_id is
  'Kanban project_work_items.id. Null = sukurta iš Įrankių, ne iš kortelės.';

create index if not exists commercial_proposals_work_item_idx
  on public.commercial_proposals (work_item_id, created_at desc)
  where work_item_id is not null;

-- status is text; draft is the real value from commercial_proposals_status_check.
create unique index if not exists commercial_proposals_one_draft_per_work_item_idx
  on public.commercial_proposals (work_item_id)
  where work_item_id is not null
    and status = 'draft';

notify pgrst, 'reload schema';

commit;
