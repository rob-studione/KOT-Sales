/**
 * Node custom loader: map `@/` → repo root for verify scripts.
 * Usage: node --import ./scripts/register-ts-path.mjs --experimental-strip-types scripts/verify-translator-search-core.mts
 * Or: npm run verify:translator-search
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let rel = specifier.slice(2);
    let abs = path.join(root, rel);
    // Prefer explicit .ts when bare
    if (!path.extname(abs)) {
      abs = `${abs}.ts`;
    }
    return nextResolve(pathToFileURL(abs).href, context);
  }
  return nextResolve(specifier, context);
}
