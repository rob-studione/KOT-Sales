begin;

-- Po AI analizės: `content` išvalomas, lieka metadata (language, transcript_source, fetched_at, content_sha256).
alter table public.yt_transcripts
  alter column content drop not null;

alter table public.yt_transcripts
  add column if not exists content_cleared_at timestamptz,
  add column if not exists content_sha256 text;

comment on column public.yt_transcripts.content_cleared_at is 'Kada transcript tekstas pašalintas po sėkmingos AI analizės.';
comment on column public.yt_transcripts.content_sha256 is 'Pilno transcript turinio SHA-256 (prieš valymą); lieka po content=null.';
comment on column public.yt_transcripts.fetched_at is 'Įrašo sukūrimo / atnaujinimo laikas (analogas „created_at“ pipeline kontekste).';

commit;
