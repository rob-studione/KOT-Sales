begin;

-- Vertėjų paieška: pašalinti netyčinį service_role DELETE (default privileges po 0137).
-- Tik šios trys lentelės; RLS / policies / kiti grant'ai neliečiami.

revoke delete on table public.translator_search_jobs from service_role;
revoke delete on table public.translator_candidates from service_role;
revoke delete on table public.translator_candidate_sources from service_role;

notify pgrst, 'reload schema';

commit;
