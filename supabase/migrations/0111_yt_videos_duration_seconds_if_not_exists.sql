begin;

alter table public.yt_videos
  add column if not exists duration_seconds integer;

commit;
