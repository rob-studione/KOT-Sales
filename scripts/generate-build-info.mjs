import { writeFile } from "node:fs/promises";
import path from "node:path";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function utcIsoDate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

async function main() {
  const now = new Date();
  const payload = {
    // Used as sidebar footer (Atnaujinta) when Vercel timestamp is unavailable.
    deploymentCreatedAt: now.toISOString(),
    buildDateIso: utcIsoDate(now),
  };

  const outPath = path.join(process.cwd(), "public", "build-info.json");
  await writeFile(outPath, JSON.stringify(payload), "utf8");
}

await main();

