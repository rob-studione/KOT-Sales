begin;

-- YouTube podcastų AI ribos (crm_settings). Saugūs numatytieji: AI išjungta, kol admin neįjungs.
insert into public.crm_settings (key, value)
values
  ('yt_podcast.enabled', 'false'::jsonb),
  ('yt_podcast.cost_limit_eur', '30'::jsonb),
  ('yt_podcast.stop_on_limit', 'true'::jsonb),
  ('yt_podcast.max_videos_per_run', '5'::jsonb),
  ('yt_podcast.max_transcript_chars', '120000'::jsonb),
  ('yt_podcast.analysis_prompt_version', '"v1"'::jsonb)
on conflict (key) do nothing;

commit;
