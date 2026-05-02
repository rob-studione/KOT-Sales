import "server-only";

export type ParsedYtRssVideo = {
  youtube_video_id: string;
  title: string;
  published_at: string;
  thumbnail_url: string | null;
  video_url: string;
  /** Kai kuriuose feeduose `media:content` turi `duration` (sek.). Dažnai YouTube RSS jo nebeturi. */
  duration_seconds: number | null;
};

export function youtubeChannelRssUrl(youtubeChannelId: string): string {
  const id = youtubeChannelId.trim();
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`;
}

function firstMatch(xml: string, re: RegExp): string | null {
  const m = xml.match(re);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

/**
 * Iš YouTube Atom RSS (<feed><entry>...) ištraukia įrašus.
 */
export function parseYoutubeChannelRssXml(xml: string): ParsedYtRssVideo[] {
  const out: ParsedYtRssVideo[] = [];
  const parts = xml.split("<entry>");
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i] ?? "";
    const entry = `<entry>${block}`;

    const videoId =
      firstMatch(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/) ??
      firstMatch(entry, /<yt:videoId[^>]*>([^<]+)<\/yt:videoId>/);
    if (!videoId) continue;

    const title = firstMatch(entry, /<title>([^<]*)<\/title>/);
    if (!title) continue;

    const published = firstMatch(entry, /<published>([^<]+)<\/published>/);
    if (!published) continue;

    const thumb =
      firstMatch(entry, /<media:thumbnail[^>]*url="([^"]+)"/) ??
      firstMatch(entry, /<media:thumbnail[^>]*\s+url='([^']+)'/);

    let videoUrl = firstMatch(entry, /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);
    if (!videoUrl) {
      videoUrl = firstMatch(entry, /<link[^>]*href="([^"]+)"[^>]*rel="alternate"/);
    }
    if (!videoUrl) {
      videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }

    const durRaw =
      firstMatch(entry, /<media:content[^>]*\bduration=['"](\d+)['"][^>]*>/i) ??
      firstMatch(entry, /<media:content[^>]*\bduration=(\d+)[\s/>]/i);
    let duration_seconds: number | null = null;
    if (durRaw) {
      const n = Number.parseInt(durRaw, 10);
      if (Number.isFinite(n) && n > 0) duration_seconds = n;
    }

    out.push({
      youtube_video_id: videoId,
      title,
      published_at: published,
      thumbnail_url: thumb,
      video_url: videoUrl,
      duration_seconds,
    });
  }
  return out;
}

export async function fetchYoutubeChannelRssXml(
  youtubeChannelId: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<string> {
  const url = youtubeChannelRssUrl(youtubeChannelId);
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ac.signal,
      headers: {
        "User-Agent": "salex-yt-podcast-sync/1.0",
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`RSS HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
