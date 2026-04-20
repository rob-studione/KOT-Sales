-- Chunked Invoice123 reconciliation jobs (30d / 90d) with lease-based claiming.

create table if not exists public.invoice_reconciliation_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('daily', 'monthly', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  overall_range_start date not null,
  overall_range_end date not null,
  current_chunk_start date not null,
  current_chunk_end date not null,
  next_page_url text null,
  chunk_index integer not null default 0,
  total_chunks integer not null,
  lease_until timestamptz null,
  locked_by text null,
  last_error text null,
  last_run_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_reconciliation_jobs_status_created_idx
  on public.invoice_reconciliation_jobs (status, created_at);

-- At most one active daily / monthly reconciliation at a time (pending or running).
create unique index if not exists invoice_reconciliation_one_active_daily
  on public.invoice_reconciliation_jobs (job_type)
  where job_type = 'daily' and status in ('pending', 'running');

create unique index if not exists invoice_reconciliation_one_active_monthly
  on public.invoice_reconciliation_jobs (job_type)
  where job_type = 'monthly' and status in ('pending', 'running');

alter table public.invoice_reconciliation_jobs enable row level security;

drop policy if exists "invoice_reconciliation_jobs_select" on public.invoice_reconciliation_jobs;
create policy "invoice_reconciliation_jobs_select"
  on public.invoice_reconciliation_jobs for select to anon using (true);

drop policy if exists "invoice_reconciliation_jobs_insert" on public.invoice_reconciliation_jobs;
create policy "invoice_reconciliation_jobs_insert"
  on public.invoice_reconciliation_jobs for insert to anon with check (true);

drop policy if exists "invoice_reconciliation_jobs_update" on public.invoice_reconciliation_jobs;
create policy "invoice_reconciliation_jobs_update"
  on public.invoice_reconciliation_jobs for update to anon using (true) with check (true);

grant select, insert, update on public.invoice_reconciliation_jobs to anon;

-- Atomic claim: one row eligible for work, with row lock (SKIP LOCKED under concurrency).
create or replace function public.claim_reconciliation_job(p_worker_id text)
returns setof public.invoice_reconciliation_jobs
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.invoice_reconciliation_jobs
    where status in ('pending', 'running')
      and (lease_until is null or lease_until < now())
    order by created_at asc
    limit 1
    for update skip locked
  )
  update public.invoice_reconciliation_jobs j
  set
    status = 'running',
    lease_until = now() + interval '2 minutes',
    locked_by = p_worker_id,
    last_run_at = now(),
    updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
$$;

grant execute on function public.claim_reconciliation_job(text) to anon;
