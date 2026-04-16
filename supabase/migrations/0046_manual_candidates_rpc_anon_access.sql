-- RPC fetch_manual_project_candidates_page + rankinių kandidatų lentelės:
-- 0045 davė tik EXECUTE rolei authenticated. CRM dažnai naudoja anon raktą be Supabase Auth
-- sesijos — JWT rolė = anon, todėl RPC arba lentelių RLS blokuoja (SQL Editor veikia kaip superuser).
-- Čia atkartojamas tas pats „atviras anon“ modelis kaip projects / project_work_items (0014, 0015).

grant execute on function public.fetch_manual_project_candidates_page(uuid, integer, integer, boolean) to anon;

grant select on public.project_manual_leads to anon;

drop policy if exists "project_manual_leads_select_anon" on public.project_manual_leads;
create policy "project_manual_leads_select_anon"
  on public.project_manual_leads
  for select
  to anon
  using (true);

grant select on public.project_manual_linked_clients to anon;

drop policy if exists "project_manual_linked_clients_select_anon" on public.project_manual_linked_clients;
create policy "project_manual_linked_clients_select_anon"
  on public.project_manual_linked_clients
  for select
  to anon
  using (true);

notify pgrst, 'reload schema';
