-- Upsert (ON CONFLICT UPDATE) requires UPDATE on public.invoices for the anon role used by the sync route.

drop policy if exists "invoices_update_public" on public.invoices;
create policy "invoices_update_public"
  on public.invoices
  for update
  to anon
  using (true)
  with check (true);

grant update on public.invoices to anon;
