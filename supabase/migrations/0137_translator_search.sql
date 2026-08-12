begin;

-- Vertėjų paieška (MVP): paieškos darbai, kandidatai, šaltiniai.
-- Authenticated: SELECT only. Rašymai — service role (serveris po admin auth).

create table if not exists public.translator_search_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.crm_users (id) on delete restrict,
  title text not null default '',
  request_params jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  stop_reason text null,
  warning text null,
  error_code text null,
  error_message text null,
  search_calls integer not null default 0 check (search_calls >= 0),
  fetch_url_count integer not null default 0 check (fetch_url_count >= 0),
  pdf_count integer not null default 0 check (pdf_count >= 0),
  openai_calls integer not null default 0 check (openai_calls >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  cost_eur_estimated numeric(12, 6) not null default 0 check (cost_eur_estimated >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);

comment on table public.translator_search_jobs is
  'Vertėjų paieška: viena vartotojo paleista paieška (MVP).';

create index if not exists translator_search_jobs_created_at_idx
  on public.translator_search_jobs (created_at desc);

create index if not exists translator_search_jobs_requested_by_idx
  on public.translator_search_jobs (requested_by, created_at desc);

create index if not exists translator_search_jobs_status_idx
  on public.translator_search_jobs (status);

create table if not exists public.translator_candidates (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default '',
  entity_type text not null default 'unknown'
    check (entity_type in ('person', 'agency', 'unknown')),
  email text null,
  phone text null,
  country text null,
  city text null,
  language_pairs jsonb not null default '[]'::jsonb,
  specializations jsonb not null default '[]'::jsonb,
  sworn_status text not null default 'unknown'
    check (sworn_status in ('unknown', 'claimed', 'verified', 'not_found')),
  website_url text null,
  match_summary text null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  dedupe_key text not null,
  reviewed_by uuid null references public.crm_users (id) on delete set null,
  reviewed_at timestamptz null,
  review_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translator_candidates_dedupe_key_key unique (dedupe_key)
);

comment on table public.translator_candidates is
  'Vertėjų paieška: globalūs rasti kandidatai (be atskiros translators master lentelės).';

create index if not exists translator_candidates_review_status_idx
  on public.translator_candidates (review_status);

create index if not exists translator_candidates_created_at_idx
  on public.translator_candidates (created_at desc);

create table if not exists public.translator_candidate_sources (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.translator_candidates (id) on delete cascade,
  job_id uuid not null references public.translator_search_jobs (id) on delete cascade,
  source_type text not null
    check (source_type in ('web', 'pdf', 'manual')),
  original_url text not null,
  canonical_url text not null,
  title text null,
  snippet text null,
  evidence jsonb not null default '{}'::jsonb,
  pdf_page integer null check (pdf_page is null or pdf_page > 0),
  retrieved_at timestamptz not null default now(),
  constraint translator_candidate_sources_job_candidate_url_key
    unique (job_id, candidate_id, canonical_url)
);

comment on table public.translator_candidate_sources is
  'Vertėjų paieška: kandidato šaltinis + field-level evidence, susietas su job.';

create index if not exists translator_candidate_sources_candidate_id_idx
  on public.translator_candidate_sources (candidate_id);

create index if not exists translator_candidate_sources_job_id_idx
  on public.translator_candidate_sources (job_id);

-- RLS: authenticated SELECT only. Table grants: žr. revoke/grant blokus žemiau.
alter table public.translator_search_jobs enable row level security;
alter table public.translator_candidates enable row level security;
alter table public.translator_candidate_sources enable row level security;

drop policy if exists "translator_search_jobs_authenticated_select" on public.translator_search_jobs;
create policy "translator_search_jobs_authenticated_select"
  on public.translator_search_jobs for select to authenticated using (true);

drop policy if exists "translator_candidates_authenticated_select" on public.translator_candidates;
create policy "translator_candidates_authenticated_select"
  on public.translator_candidates for select to authenticated using (true);

drop policy if exists "translator_candidate_sources_authenticated_select"
  on public.translator_candidate_sources;
create policy "translator_candidate_sources_authenticated_select"
  on public.translator_candidate_sources for select to authenticated using (true);

-- Table privileges (explicit): anon none; authenticated SELECT; service_role SELECT/INSERT/UPDATE; no DELETE.
revoke all on table public.translator_search_jobs from anon, authenticated, public;
revoke all on table public.translator_candidates from anon, authenticated, public;
revoke all on table public.translator_candidate_sources from anon, authenticated, public;

grant select on table public.translator_search_jobs to authenticated;
grant select on table public.translator_candidates to authenticated;
grant select on table public.translator_candidate_sources to authenticated;

grant select, insert, update on table public.translator_search_jobs to service_role;
grant select, insert, update on table public.translator_candidates to service_role;
grant select, insert, update on table public.translator_candidate_sources to service_role;

notify pgrst, 'reload schema';

commit;
