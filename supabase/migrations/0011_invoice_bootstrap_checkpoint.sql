-- Checkpoint for batched historical invoice import (Saskaita123 / Invoice123).
-- Single logical row (id = default); server routes advance it between cron/job runs.

create table if not exists public.invoice_bootstrap_checkpoint (
  id text primary key default 'default',
  strategy text not null default 'range' check (strategy in ('range', 'page')),
  next_page integer not null default 1,
  range_start date null,
  range_end date null,
  range_next_page integer not null default 1,
  oldest_invoice_date_seen date null,
  last_batch_at timestamptz null,
  last_batch_imported integer not null default 0,
  finished boolean not null default false,
  total_imported_bootstrap bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.invoice_bootstrap_checkpoint (id) values ('default')
on conflict (id) do nothing;

alter table public.invoice_bootstrap_checkpoint enable row level security;

drop policy if exists "invoice_bootstrap_checkpoint_select" on public.invoice_bootstrap_checkpoint;
create policy "invoice_bootstrap_checkpoint_select"
  on public.invoice_bootstrap_checkpoint for select to anon using (true);

drop policy if exists "invoice_bootstrap_checkpoint_insert" on public.invoice_bootstrap_checkpoint;
create policy "invoice_bootstrap_checkpoint_insert"
  on public.invoice_bootstrap_checkpoint for insert to anon with check (true);

drop policy if exists "invoice_bootstrap_checkpoint_update" on public.invoice_bootstrap_checkpoint;
create policy "invoice_bootstrap_checkpoint_update"
  on public.invoice_bootstrap_checkpoint for update to anon using (true) with check (true);

grant select, insert, update on public.invoice_bootstrap_checkpoint to anon;
