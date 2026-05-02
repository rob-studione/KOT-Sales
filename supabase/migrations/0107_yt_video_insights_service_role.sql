begin;

-- Backend (service_role) įrašo įžvalgas ir atnaujina kaštų laukus.
grant insert, update, delete on public.yt_video_insights to service_role;

commit;
