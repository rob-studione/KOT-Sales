begin;

-- YouTube / podcast ingestion (CRM „Podcastai“ įrankis). Lentelės su yt_* prefix.

create table if not exists public.yt_channels (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text not null,
  title text not null default '',
  custom_url text,
  thumbnail_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yt_channels_youtube_channel_id_key unique (youtube_channel_id)
);

create table if not exists public.yt_videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.yt_channels (id) on delete cascade,
  youtube_video_id text not null,
  title text not null default '',
  description text,
  published_at timestamptz,
  thumbnail_url text,
  duration_seconds integer,
  processing_state text not null default 'new',
  skip_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yt_videos_youtube_video_id_key unique (youtube_video_id)
);

create index if not exists yt_videos_channel_id_idx on public.yt_videos (channel_id);
create index if not exists yt_videos_processing_state_idx on public.yt_videos (processing_state);
create index if not exists yt_videos_published_at_idx on public.yt_videos (published_at desc);

create table if not exists public.yt_transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.yt_videos (id) on delete cascade,
  language text,
  transcript_source text,
  content text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists yt_transcripts_video_id_idx on public.yt_transcripts (video_id);

create table if not exists public.yt_video_insights (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.yt_videos (id) on delete cascade,
  headline text,
  summary text,
  detail jsonb not null default '{}'::jsonb,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists yt_video_insights_video_id_idx on public.yt_video_insights (video_id);

create table if not exists public.yt_weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  channel_id uuid references public.yt_channels (id) on delete set null,
  title text,
  body text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists yt_weekly_summaries_week_start_idx on public.yt_weekly_summaries (week_start desc);
create index if not exists yt_weekly_summaries_channel_id_idx on public.yt_weekly_summaries (channel_id);

-- RLS: tik skaitymas autentifikuotiems (įrašus vėliau gali daryti service role / backend).
alter table public.yt_channels enable row level security;
alter table public.yt_videos enable row level security;
alter table public.yt_transcripts enable row level security;
alter table public.yt_video_insights enable row level security;
alter table public.yt_weekly_summaries enable row level security;

drop policy if exists "yt_channels_authenticated_select" on public.yt_channels;
create policy "yt_channels_authenticated_select"
  on public.yt_channels for select to authenticated using (true);

drop policy if exists "yt_videos_authenticated_select" on public.yt_videos;
create policy "yt_videos_authenticated_select"
  on public.yt_videos for select to authenticated using (true);

drop policy if exists "yt_transcripts_authenticated_select" on public.yt_transcripts;
create policy "yt_transcripts_authenticated_select"
  on public.yt_transcripts for select to authenticated using (true);

drop policy if exists "yt_video_insights_authenticated_select" on public.yt_video_insights;
create policy "yt_video_insights_authenticated_select"
  on public.yt_video_insights for select to authenticated using (true);

drop policy if exists "yt_weekly_summaries_authenticated_select" on public.yt_weekly_summaries;
create policy "yt_weekly_summaries_authenticated_select"
  on public.yt_weekly_summaries for select to authenticated using (true);

grant select on public.yt_channels to authenticated;
grant select on public.yt_videos to authenticated;
grant select on public.yt_transcripts to authenticated;
grant select on public.yt_video_insights to authenticated;
grant select on public.yt_weekly_summaries to authenticated;

commit;
