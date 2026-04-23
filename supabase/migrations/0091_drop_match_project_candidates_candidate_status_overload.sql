-- Cleanup: drop legacy overload that causes PostgREST ambiguity.
-- Leaves only the baseline match_project_candidates(date,date,int,int,uuid) signature.

drop function if exists public.match_project_candidates(
  date,
  date,
  integer,
  integer,
  uuid,
  text
);

notify pgrst, 'reload schema';

