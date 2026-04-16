-- Lost QA: add actionable Lithuanian guidance field for UI / manager use.

begin;

alter table public.lost_case_analysis
  add column if not exists what_to_do_better_lt text null;

commit;

