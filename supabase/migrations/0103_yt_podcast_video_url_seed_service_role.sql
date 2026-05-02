begin;

-- Papildomi laukai RSS sinchronizacijai + numatytasis apdorojimo statusas.
alter table public.yt_videos
  add column if not exists video_url text;

alter table public.yt_videos
  alter column processing_state set default 'pending';

comment on column public.yt_videos.video_url is 'Pilna YouTube peržiūros nuoroda (iš RSS alternate link).';

-- Backend (service role) sinchronizacija.
grant select, insert, update, delete on public.yt_channels to service_role;
grant select, insert, update, delete on public.yt_videos to service_role;

-- Pradiniai 5 podcastų kanalai (channel_id patvirtinti pagal YouTube RSS / kanalo puslapį).
insert into public.yt_channels (youtube_channel_id, title, custom_url, is_active)
values
  ('UCUyDOdBWhC1MCxEjC46d-zw', 'Alex Hormozi', '@AlexHormozi', true),
  ('UCyaN6mg5u8Cjy2ZI4ikWaug', 'My First Million', '@MyFirstMillionPod', true),
  ('UCcefcZRL2oaA_uBNeo5UOWg', 'Y Combinator', '@ycombinator', true),
  ('UChpleBmo18P08aKCIgti38g', 'Matt Wolfe', '@mattwolfe', true),
  ('UCGq-a57w-aPwyi3pW7XLiHw', 'The Diary Of A CEO', '@TheDiaryOfACEO', true)
on conflict (youtube_channel_id) do update set
  title = excluded.title,
  custom_url = excluded.custom_url,
  is_active = excluded.is_active,
  updated_at = now();

commit;
