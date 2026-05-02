begin;

-- ---------------------------------------------------------------------
-- Enable RLS + authenticated-only access for CRM tables that must not be
-- publicly readable/writable. Service role bypasses RLS automatically.
-- ---------------------------------------------------------------------

-- Playbooks (CRM scenarijai)
alter table public.playbooks enable row level security;
drop policy if exists "Allow authenticated" on public.playbooks;
create policy "Allow authenticated"
on public.playbooks
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.playbooks to authenticated;

alter table public.playbook_nodes enable row level security;
drop policy if exists "Allow authenticated" on public.playbook_nodes;
create policy "Allow authenticated"
on public.playbook_nodes
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.playbook_nodes to authenticated;

alter table public.playbook_edges enable row level security;
drop policy if exists "Allow authenticated" on public.playbook_edges;
create policy "Allow authenticated"
on public.playbook_edges
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.playbook_edges to authenticated;

-- Lost QA (Gmail ingestion + analysis storage)
alter table public.gmail_mailboxes enable row level security;
drop policy if exists "Allow authenticated" on public.gmail_mailboxes;
create policy "Allow authenticated"
on public.gmail_mailboxes
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.gmail_mailboxes to authenticated;

alter table public.gmail_threads_raw enable row level security;
drop policy if exists "Allow authenticated" on public.gmail_threads_raw;
create policy "Allow authenticated"
on public.gmail_threads_raw
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.gmail_threads_raw to authenticated;

alter table public.lost_cases enable row level security;
drop policy if exists "Allow authenticated" on public.lost_cases;
create policy "Allow authenticated"
on public.lost_cases
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.lost_cases to authenticated;

alter table public.lost_case_messages enable row level security;
drop policy if exists "Allow authenticated" on public.lost_case_messages;
create policy "Allow authenticated"
on public.lost_case_messages
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.lost_case_messages to authenticated;

alter table public.lost_case_analysis enable row level security;
drop policy if exists "Allow authenticated" on public.lost_case_analysis;
create policy "Allow authenticated"
on public.lost_case_analysis
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.lost_case_analysis to authenticated;

alter table public.lost_daily_summaries enable row level security;
drop policy if exists "Allow authenticated" on public.lost_daily_summaries;
create policy "Allow authenticated"
on public.lost_daily_summaries
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.lost_daily_summaries to authenticated;

alter table public.lost_manager_reviews enable row level security;
drop policy if exists "Allow authenticated" on public.lost_manager_reviews;
create policy "Allow authenticated"
on public.lost_manager_reviews
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.lost_manager_reviews to authenticated;

alter table public.prepared_lost_case_inputs enable row level security;
drop policy if exists "Allow authenticated" on public.prepared_lost_case_inputs;
create policy "Allow authenticated"
on public.prepared_lost_case_inputs
for all
to authenticated
using (true)
with check (true);
grant select, insert, update, delete on public.prepared_lost_case_inputs to authenticated;

commit;

