begin;

-- Vienas transkriptas per video + kalbą (upsert iš transcript worker).
create unique index if not exists yt_transcripts_video_id_language_key
  on public.yt_transcripts (video_id, language);

comment on index public.yt_transcripts_video_id_language_key is
  'Leidžia upsert pagal (video_id, language), pvz. language=en.';

grant select, insert, update, delete on public.yt_transcripts to service_role;

commit;
