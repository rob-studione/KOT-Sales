import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export type YtTranscriptSource = "ytdlp:manual" | "ytdlp:auto" | "ytdlp:unknown";

export type YtFetchedTranscript = {
  content: string;
  source: YtTranscriptSource;
};

const MAX_TRANSCRIPT_CHARS = 1_500_000;

function resolveYtDlpBinary(): string {
  const fromEnv = process.env.YT_DLP_PATH?.trim();
  if (fromEnv) return fromEnv;
  return "yt-dlp";
}

function youtubeWatchUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`;
}

/** Pašalina SRT laiko žymes, palieka gryną tekstą. */
export function srtToPlainText(srt: string): string {
  const lines = srt.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d+$/.test(t)) continue;
    if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(t)) continue;
    out.push(t);
  }
  const joined = out.join("\n").replace(/\n{2,}/g, "\n").trim();
  return joined.length > MAX_TRANSCRIPT_CHARS ? joined.slice(0, MAX_TRANSCRIPT_CHARS) : joined;
}

/** Paprastas WebVTT → tekstas (be žymų eilučių). */
export function vttToPlainText(vtt: string): string {
  const lines = vtt.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t === "WEBVTT" || t.startsWith("NOTE") || t.startsWith("STYLE") || t.startsWith("REGION")) continue;
    if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+/.test(t)) continue;
    if (/^\d+$/.test(t)) continue;
    out.push(t);
  }
  const joined = out.join("\n").replace(/\n{2,}/g, "\n").trim();
  return joined.length > MAX_TRANSCRIPT_CHARS ? joined.slice(0, MAX_TRANSCRIPT_CHARS) : joined;
}

async function readFirstSubtitleFile(dir: string, exts: readonly string[]): Promise<{ path: string } | null> {
  const names = await readdir(dir);
  const lower = names.filter((n) => exts.some((e) => n.toLowerCase().endsWith(e)));
  if (lower.length === 0) return null;
  lower.sort();
  const name = lower[0];
  if (!name) return null;
  return { path: join(dir, name) };
}

async function tryDownloadSubs(
  workDir: string,
  videoUrl: string,
  mode: "manual" | "auto"
): Promise<YtFetchedTranscript | null> {
  const bin = resolveYtDlpBinary();
  const outTemplate = join(workDir, "%(id)s");
  const head =
    mode === "manual"
      ? (["--write-subs", "--no-write-auto-subs"] as const)
      : (["--write-auto-subs", "--no-write-subs"] as const);

  const args = [
    ...head,
    "--skip-download",
    "--no-warnings",
    "--no-playlist",
    "--sub-langs",
    "en.*",
    "--sub-format",
    "best",
    "-o",
    outTemplate,
    videoUrl,
  ];
  const source: YtTranscriptSource = mode === "manual" ? "ytdlp:manual" : "ytdlp:auto";

  let stderr = "";
  try {
    await execFileAsync(bin, args, {
      cwd: workDir,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 180_000,
      windowsHide: true,
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      throw new Error(
        "Nepavyko paleisti `yt-dlp`. Įdiekite įrankį (pvz. `brew install yt-dlp`) arba nustatykite `YT_DLP_PATH`."
      );
    }
    stderr = String(err.stderr ?? err.message ?? "");
  }

  const vtt = await readFirstSubtitleFile(workDir, [".vtt"]);
  if (vtt) {
    const raw = await readFile(vtt.path, "utf8");
    const text = vttToPlainText(raw);
    if (text.length > 0) {
      return { content: text, source };
    }
  }

  const srt = await readFirstSubtitleFile(workDir, [".srt"]);
  if (srt) {
    const raw = await readFile(srt.path, "utf8");
    const text = srtToPlainText(raw);
    if (text.length > 0) {
      return { content: text, source };
    }
  }

  if (stderr && !stderr.includes("There are no subtitles")) {
    const low = stderr.toLowerCase();
    if (low.includes("private video") || low.includes("video unavailable")) {
      throw new Error(truncateOneLine(stderr, 400));
    }
  }

  return null;
}

function truncateOneLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

/**
 * Parsisiunčia tik angliškus subtitrus per `yt-dlp` (be vaizdo / garso parsisiuntimo).
 * Pirmenybė: rankiniai EN → automatiniai EN. Jei nėra EN — grąžina `null`.
 */
/**
 * `yt-dlp --dump-json` be parsisiuntimo — trukmė sekundėmis, jei prieinama.
 * Nesėkmė → `null` (nekelia klaidos pipeline).
 */
export async function fetchYoutubeVideoDurationSecondsViaYtDlp(youtubeVideoId: string): Promise<number | null> {
  const id = youtubeVideoId.trim();
  if (!id) return null;
  const videoUrl = youtubeWatchUrl(id);
  const bin = resolveYtDlpBinary();
  let stdout = "";
  try {
    const r = await execFileAsync(
      bin,
      ["--dump-json", "--no-download", "--no-warnings", "--no-playlist", videoUrl],
      {
        maxBuffer: 6 * 1024 * 1024,
        timeout: 90_000,
        windowsHide: true,
      }
    );
    stdout = String(r.stdout ?? "");
  } catch {
    return null;
  }
  try {
    const j = JSON.parse(stdout) as { duration?: unknown };
    const d = j.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return Math.round(d);
  } catch {
    return null;
  }
  return null;
}

export async function fetchYoutubeEnglishTranscriptViaYtDlp(youtubeVideoId: string): Promise<YtFetchedTranscript | null> {
  const id = youtubeVideoId.trim();
  if (!id) throw new Error("Tuščias youtube_video_id");
  const videoUrl = youtubeWatchUrl(id);

  for (const mode of ["manual", "auto"] as const) {
    const workDir = await mkdtemp(join(tmpdir(), "salex-ytdlp-"));
    try {
      const r = await tryDownloadSubs(workDir, videoUrl, mode);
      if (r) return r;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  return null;
}
