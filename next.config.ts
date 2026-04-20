import type { NextConfig } from "next";

function safeShortSha(input: string | undefined | null): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  return v.slice(0, 7);
}

function safeIsoDate(input: string | undefined | null): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const vercelCommitHash = safeShortSha(process.env.VERCEL_GIT_COMMIT_SHA);
const vercelBuildDate = safeIsoDate(process.env.VERCEL_GIT_COMMIT_DATE);

const nextPublicCommitHash = vercelCommitHash || String(process.env.NEXT_PUBLIC_COMMIT_HASH ?? "").trim();
const nextPublicBuildDate = vercelBuildDate || String(process.env.NEXT_PUBLIC_BUILD_DATE ?? "").trim();
const nextPublicAppVersion = String(process.env.NEXT_PUBLIC_APP_VERSION ?? "").trim();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_HASH: nextPublicCommitHash || "",
    NEXT_PUBLIC_BUILD_DATE: nextPublicBuildDate || "",
    NEXT_PUBLIC_APP_VERSION: nextPublicAppVersion || "",
  },
};

export default nextConfig;
