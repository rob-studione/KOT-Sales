begin;

alter table public.yt_weekly_summaries
  add column if not exists week_end date;

update public.yt_weekly_summaries
set week_end = week_start
where week_end is null;

-- Nauji įrašai visada turi week_end (aplikacija nustato).
alter table public.yt_weekly_summaries
  alter column week_end set not null;

comment on column public.yt_weekly_summaries.week_end is 'Santraukos laikotarpio pabaiga (kalendorinė diena, Vilnius).';

-- Vienas globalus įrašas vienam (week_start, week_end) porai.
create unique index if not exists yt_weekly_summaries_global_week_window_key
  on public.yt_weekly_summaries (week_start, week_end)
  where channel_id is null;

grant insert, update, delete on public.yt_weekly_summaries to service_role;

commit;
