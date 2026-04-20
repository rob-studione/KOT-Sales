begin;

-- Lightweight AI usage accounting (tokens + estimated EUR cost).
-- Service role (backend) can insert freely; authenticated admins can read for CRM settings UI.

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('prepare', 'analyze', 'summary')),
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  cost_eur numeric(12, 6) not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage_logs is 'AI usage logs (tokens + estimated EUR cost).';

create index if not exists ai_usage_logs_created_at_idx
  on public.ai_usage_logs (created_at desc);

create index if not exists ai_usage_logs_type_created_at_idx
  on public.ai_usage_logs (type, created_at desc);

alter table public.ai_usage_logs enable row level security;

-- Backend inserts via service role bypass RLS.

drop policy if exists "ai_usage_logs_admin_select" on public.ai_usage_logs;
create policy "ai_usage_logs_admin_select"
  on public.ai_usage_logs for select to authenticated
  using (
    exists (select 1 from public.crm_users u where u.id = (select auth.uid()) and u.role = 'admin')
  );

grant select on public.ai_usage_logs to authenticated;

commit;
