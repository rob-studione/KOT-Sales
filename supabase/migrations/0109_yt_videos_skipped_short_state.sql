begin;

-- Nauja būsena: per trumpas transkriptas prieš AI (Shorts ir pan.)
alter table public.yt_videos
  drop constraint if exists yt_videos_processing_state_check;

alter table public.yt_videos
  add constraint yt_videos_processing_state_check
  check (
    processing_state in (
      'pending',
      'processing',
      'transcript_ready',
      'analysis_ready',
      'skipped_no_transcript',
      'skipped_short',
      'failed'
    )
  );

commit;
