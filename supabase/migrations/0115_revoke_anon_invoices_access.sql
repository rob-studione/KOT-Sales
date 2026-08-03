-- Lock down public invoice/client data: anon must not read or write invoices.
-- Neksar sync now uses service_role via /api/sync-neksar (server-only).
-- CRM continues via authenticated SELECT (invoices_select_authenticated).
-- Does not change security_invoker on v_client_list_from_invoices.

begin;

-- invoices: drop legacy public (anon) policies
drop policy if exists "invoices_select_public" on public.invoices;
drop policy if exists "invoices_insert_public" on public.invoices;
drop policy if exists "invoices_update_public" on public.invoices;

revoke all on table public.invoices from anon;

-- view: no public/anon read of client PII aggregates
revoke all on table public.v_client_list_from_invoices from anon;

-- sync state was also writable by anon for the old sync path
drop policy if exists "invoice_sync_state_select_public" on public.invoice_sync_state;
drop policy if exists "invoice_sync_state_upsert_public" on public.invoice_sync_state;
drop policy if exists "invoice_sync_state_update_public" on public.invoice_sync_state;
revoke all on table public.invoice_sync_state from anon;

-- Preserve authenticated CRM read access
grant select on table public.invoices to authenticated;
grant select on table public.v_client_list_from_invoices to authenticated;

commit;
