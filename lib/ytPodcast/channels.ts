/**
 * Kanoniniai YouTube kanalai (podcastų įrankis). `youtube_channel_id` sutampa su RSS:
 * https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 */
export type YtPodcastChannelSeed = {
  youtube_channel_id: string;
  title: string;
  /** @handle ar tuščia */
  custom_url: string | null;
};

export const YT_PODCAST_CHANNEL_SEEDS: readonly YtPodcastChannelSeed[] = [
  {
    youtube_channel_id: "UCUyDOdBWhC1MCxEjC46d-zw",
    title: "Alex Hormozi",
    custom_url: "@AlexHormozi",
  },
  {
    youtube_channel_id: "UCyaN6mg5u8Cjy2ZI4ikWaug",
    title: "My First Million",
    custom_url: "@MyFirstMillionPod",
  },
  {
    youtube_channel_id: "UCcefcZRL2oaA_uBNeo5UOWg",
    title: "Y Combinator",
    custom_url: "@ycombinator",
  },
  {
    youtube_channel_id: "UChpleBmo18P08aKCIgti38g",
    title: "Matt Wolfe",
    custom_url: "@mattwolfe",
  },
  {
    youtube_channel_id: "UCGq-a57w-aPwyi3pW7XLiHw",
    title: "The Diary Of A CEO",
    custom_url: "@TheDiaryOfACEO",
  },
] as const;
