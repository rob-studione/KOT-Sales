-- Persist last Invoice123 sync status for CRM UI (server-side).

create table if not exists public.invoice_sync_state (
  id text primary key default 'default',
  last_run_at timestamptz null,
  last_result jsonb null,
  last_error text null,
  updated_at timestamptz not null default now()
);

insert into public.invoice_sync_state (id) values ('default')
on conflict (id) do nothing;

alter table public.invoice_sync_state enable row level security;

drop policy if exists "invoice_sync_state_select_public" on public.invoice_sync_state;
create policy "invoice_sync_state_select_public"
  on public.invoice_sync_state
  for select
  to anon
  using (true);

drop policy if exists "invoice_sync_state_upsert_public" on public.invoice_sync_state;
create policy "invoice_sync_state_upsert_public"
  on public.invoice_sync_state
  for insert
  to anon
  with check (true);

drop policy if exists "invoice_sync_state_update_public" on public.invoice_sync_state;
create policy "invoice_sync_state_update_public"
  on public.invoice_sync_state
  for update
  to anon
  using (true)
  with check (true);

grant select, insert, update on public.invoice_sync_state to anon;

