-- Ensure authenticated users can access project_work_items and invoices.
-- We use cookie-based SSR clients in CRM pages, so authenticated must have SELECT at minimum.

begin;

-- project_work_items
alter table public.project_work_items enable row level security;

drop policy if exists "project_work_items_select_authenticated" on public.project_work_items;
create policy "project_work_items_select_authenticated"
  on public.project_work_items for select to authenticated using (true);

drop policy if exists "project_work_items_insert_authenticated" on public.project_work_items;
create policy "project_work_items_insert_authenticated"
  on public.project_work_items for insert to authenticated with check (true);

drop policy if exists "project_work_items_update_authenticated" on public.project_work_items;
create policy "project_work_items_update_authenticated"
  on public.project_work_items for update to authenticated using (true) with check (true);

grant select, insert, update on public.project_work_items to authenticated;

-- invoices (used by candidates & analytics on project detail)
alter table public.invoices enable row level security;

drop policy if exists "invoices_select_authenticated" on public.invoices;
create policy "invoices_select_authenticated"
  on public.invoices for select to authenticated using (true);

grant select on public.invoices to authenticated;

commit;

