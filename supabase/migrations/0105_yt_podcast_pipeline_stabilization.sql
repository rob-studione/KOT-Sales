begin;

-- ------------------------------------------------------------
-- yt_videos: state kanonas + retry laukai
-- ------------------------------------------------------------
alter table public.yt_videos
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz;

update public.yt_videos
set processing_state = case
  when processing_state in ('done', 'processed', 'complete') then 'analysis_ready'
  when processing_state in ('skipped') then 'skipped_no_transcript'
  when processing_state in ('error') then 'failed'
  else processing_state
end;

update public.yt_videos
set processing_state = 'failed',
    last_error = coalesce(nullif(last_error, ''), 'invalid_legacy_state:' || coalesce(processing_state, 'null'))
where processing_state not in (
  'pending',
  'processing',
  'transcript_ready',
  'analysis_ready',
  'skipped_no_transcript',
  'failed'
);

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
      'failed'
    )
  );

create index if not exists yt_videos_pending_retry_idx
  on public.yt_videos (processing_state, next_attempt_at, published_at);

-- ------------------------------------------------------------
-- Atominis claim RPC transcript worker'iui
-- ------------------------------------------------------------
create or replace function public.claim_yt_podcast_videos_for_transcript(p_limit integer default 10)
returns table (
  id uuid,
  youtube_video_id text,
  attempts integer,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
begin
  return query
  with picked as (
    select v.id
    from public.yt_videos v
    where v.processing_state = 'pending'
      and (v.next_attempt_at is null or v.next_attempt_at <= now())
    order by v.published_at asc nulls last, v.created_at asc
    limit v_limit
    for update skip locked
  ),
  updated as (
    update public.yt_videos v
    set processing_state = 'processing',
        updated_at = now()
    from picked p
    where v.id = p.id
    returning v.id, v.youtube_video_id, v.attempts, v.published_at
  )
  select u.id, u.youtube_video_id, u.attempts, u.published_at
  from updated u
  order by u.published_at asc nulls last;
end;
$$;

grant execute on function public.claim_yt_podcast_videos_for_transcript(integer) to service_role;

-- ------------------------------------------------------------
-- yt_video_insights: paruošimas AI etapui (idempotencija + kaštai)
-- ------------------------------------------------------------
alter table public.yt_video_insights
  add column if not exists analysis_prompt_version text not null default '',
  add column if not exists content_sha256 text not null default '',
  add column if not exists model text,
  add column if not exists tokens_input integer,
  add column if not exists tokens_output integer,
  add column if not exists cost_eur numeric,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists yt_video_insights_video_prompt_hash_key
  on public.yt_video_insights (video_id, analysis_prompt_version, content_sha256);

commit;
