-- Lost QA: Lithuanian-first analysis fields for UI display.

begin;

alter table public.lost_case_analysis
  add column if not exists primary_reason_lt text null,
  add column if not exists why_lost_lt text null,
  add column if not exists key_moments jsonb not null default '[]'::jsonb;

-- Ensure key_moments is always a JSON array
alter table public.lost_case_analysis
  drop constraint if exists lost_case_analysis_key_moments_is_array;
alter table public.lost_case_analysis
  add constraint lost_case_analysis_key_moments_is_array check (jsonb_typeof(key_moments) = 'array');

commit;

