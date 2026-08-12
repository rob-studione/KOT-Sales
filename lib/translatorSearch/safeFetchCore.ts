/**
 * Safe HTML fetch core (be server-only) — pinned public IP jungtis (anti DNS-rebinding),
 * full-request timeout įskaitant body, redirect re-check.
 */

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import net from "node:net";

import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import {
  assertSafeHttpsUrlSync,
  canonicalizeUrl,
  isBlockedIpAddress,
  normalizeIpHostname,
  type UrlSafetyErr,
} from "@/lib/translatorSearch/urlSafety";

export type SafeFetchOk = {
  ok: true;
  finalUrl: string;
  canonicalUrl: string;
  contentType: string;
  html: string;
  titleHint: string | null;
  pinnedIp: string;
};

export type SafeFetchErr = {
  ok: false;
  code: string;
  error: string;
};

export type SafeFetchResult = SafeFetchOk | SafeFetchErr;

export type DnsLookupFn = (hostname: string) => Promise<string[]>;

export type PinnedHttpResponse = {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  /** Async iterable / stream of body chunks; must respect abort signal. */
  body: AsyncIterable<Uint8Array>;
  /** Optional explicit destroy/cancel for unread bodies (redirects, early errors). */
  destroyBody?: () => void;
};

export type PinnedHttpRequestFn = (args: {
  url: URL;
  pinnedIp: string;
  signal: AbortSignal;
  headers: Record<string, string>;
}) => Promise<PinnedHttpResponse>;

async function defaultDnsLookup(hostname: string): Promise<string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

export async function resolvePublicIps(
  hostname: string,
  lookup: DnsLookupFn
): Promise<{ ok: true; ips: string[] } | UrlSafetyErr> {
  const host = normalizeIpHostname(hostname);

  // Literal IP host
  if (net.isIP(host)) {
    if (isBlockedIpAddress(host)) {
      return { ok: false, code: "dns_blocked_ip", error: "Hostname nurodo neviešą / rezervuotą IP." };
    }
    return { ok: true, ips: [host] };
  }

  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    return { ok: false, code: "dns_failed", error: "Nepavyko išspręsti hostname DNS." };
  }
  if (!addresses.length) {
    return { ok: false, code: "dns_empty", error: "DNS negrąžino adresų." };
  }

  const publicIps = addresses
    .map((a) => normalizeIpHostname(a))
    .filter((a) => a && !isBlockedIpAddress(a));
  if (!publicIps.length) {
    return {
      ok: false,
      code: "dns_blocked_ip",
      error: "Hostname nurodo neviešą / rezervuotą IP.",
    };
  }
  return { ok: true, ips: publicIps };
}

function contentTypeIsHtml(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const base = String(contentType).split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "text/html" || base === "application/xhtml+xml";
}

function extractTitleHint(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const t = m[1]!.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : null;
}

function hostHeaderValue(hostname: string, port: string): string {
  const bare = normalizeIpHostname(hostname);
  const needsBrackets = net.isIP(bare) === 6;
  const host = needsBrackets ? `[${bare}]` : bare;
  if (!port || port === "443" || port === "80") return host;
  return `${host}:${port}`;
}

/** Destroy / cancel unread response body so sockets are not left hanging. */
export function discardResponseBody(res: PinnedHttpResponse): void {
  try {
    if (typeof res.destroyBody === "function") {
      res.destroyBody();
      return;
    }
    const body = res.body as AsyncIterable<Uint8Array> & {
      destroy?: (err?: Error) => void;
      cancel?: (reason?: unknown) => Promise<void> | void;
      return?: (value?: unknown) => Promise<IteratorResult<Uint8Array>>;
    };
    if (typeof body.destroy === "function") {
      body.destroy();
      return;
    }
    if (typeof body.cancel === "function") {
      void body.cancel();
      return;
    }
    if (typeof body.return === "function") {
      void body.return();
    }
  } catch {
    // ignore destroy errors
  }
}

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

/** Default pinned request via Node http(s) — jungiasi prie IP, Host/SNI = originalus hostname. */
export function createNodePinnedHttpRequest(): PinnedHttpRequestFn {
  return async ({ url, pinnedIp, signal, headers }) => {
    const isHttps = url.protocol === "https:";
    const port = url.port ? Number(url.port) : isHttps ? 443 : 80;
    const path = `${url.pathname}${url.search}`;
    const lib = isHttps ? https : http;
    const hostname = normalizeIpHostname(url.hostname);
    const connectHost = normalizeIpHostname(pinnedIp);

    return await new Promise<PinnedHttpResponse>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }

      let headersSettled = false;
      let response: IncomingMessage | null = null;
      let abortListenerRemoved = false;

      const removeAbortListener = () => {
        if (abortListenerRemoved) return;
        abortListenerRemoved = true;
        signal.removeEventListener("abort", onAbort);
      };

      const destroyActive = () => {
        const err = abortError();
        try {
          req.destroy(err);
        } catch {
          // ignore
        }
        try {
          response?.destroy(err);
        } catch {
          // ignore
        }
      };

      const onAbort = () => {
        destroyActive();
      };

      const onBodyFinished = () => {
        removeAbortListener();
      };

      const req = lib.request(
        {
          host: connectHost,
          port,
          path,
          method: "GET",
          headers: {
            ...headers,
            Host: hostHeaderValue(hostname, url.port),
          },
          // SNI for DNS hostnames only; IP literals must not set servername.
          servername: isHttps && !net.isIP(hostname) ? hostname : undefined,
          setHost: false,
          timeout: 0,
          // Prefer IPv6 family when connecting to v6 literal
          family: net.isIP(connectHost) === 6 ? 6 : net.isIP(connectHost) === 4 ? 4 : undefined,
        },
        (res: IncomingMessage) => {
          if (headersSettled) return;
          headersSettled = true;
          response = res;
          // Keep abort listener until body end/close/error or explicit destroy —
          // timeout after headers must still destroy a stalled body/socket.
          res.once("end", onBodyFinished);
          res.once("close", onBodyFinished);
          res.once("error", onBodyFinished);
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: res as unknown as AsyncIterable<Uint8Array>,
            destroyBody: () => {
              try {
                res.destroy(abortError());
              } catch {
                // ignore
              }
              removeAbortListener();
            },
          });
        }
      );

      signal.addEventListener("abort", onAbort);
      req.on("error", (err) => {
        if (headersSettled) {
          // Body consumer / destroy path handles post-header failures.
          return;
        }
        headersSettled = true;
        removeAbortListener();
        reject(err);
      });
      req.on("close", () => {
        if (!headersSettled) {
          // Connection closed before headers — ensure listener is not leaked.
          removeAbortListener();
        }
      });
      req.end();
    });
  };
}

/**
 * Read body with byte limit. Races each `iterator.next()` against abort so a
 * stalled/hung body cannot wait forever after headers.
 */
async function readBodyWithLimit(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
  destroyOnAbort?: () => void
): Promise<{ ok: true; buf: Buffer } | SafeFetchErr> {
  const timeoutResult = (): SafeFetchErr => ({
    ok: false,
    code: "fetch_timeout",
    error: "Užklausos laikas baigėsi.",
  });

  if (signal.aborted) {
    try {
      destroyOnAbort?.();
    } catch {
      // ignore
    }
    return timeoutResult();
  }

  const iterator = body[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let total = 0;
  let removeAbort: (() => void) | undefined;

  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => {
      try {
        destroyOnAbort?.();
      } catch {
        // ignore
      }
      try {
        void iterator.return?.(undefined);
      } catch {
        // ignore
      }
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort);
    removeAbort = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    while (true) {
      const nextPromise = iterator.next();
      // If abort wins the race, a later destroy may reject this — avoid unhandled rejection.
      void nextPromise.catch(() => undefined);
      const nextResult = await Promise.race([nextPromise, aborted]);
      if (nextResult.done) break;

      if (signal.aborted) {
        try {
          destroyOnAbort?.();
        } catch {
          // ignore
        }
        return timeoutResult();
      }

      const buf = Buffer.isBuffer(nextResult.value)
        ? nextResult.value
        : Buffer.from(nextResult.value);
      total += buf.byteLength;
      if (total > maxBytes) {
        try {
          destroyOnAbort?.();
        } catch {
          // ignore
        }
        try {
          void iterator.return?.(undefined);
        } catch {
          // ignore
        }
        return { ok: false, code: "body_too_large", error: "Atsakymas per didelis." };
      }
      chunks.push(buf);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (signal.aborted || /abort/i.test(msg)) {
      return timeoutResult();
    }
    return { ok: false, code: "fetch_failed", error: "Nepavyko nuskaityti atsakymo." };
  } finally {
    removeAbort?.();
  }

  if (signal.aborted) return timeoutResult();
  return { ok: true, buf: Buffer.concat(chunks) };
}

/**
 * Safe public HTML fetch with DNS pinning (anti-rebinding).
 */
export async function safeFetchHtmlCore(
  rawUrl: string,
  opts?: {
    lookup?: DnsLookupFn;
    pinnedRequest?: PinnedHttpRequestFn;
    maxBytes?: number;
    maxRedirects?: number;
    timeoutMs?: number;
  }
): Promise<SafeFetchResult> {
  const lookup = opts?.lookup ?? defaultDnsLookup;
  const pinnedRequest = opts?.pinnedRequest ?? createNodePinnedHttpRequest();
  const maxBytes = opts?.maxBytes ?? TRANSLATOR_SEARCH_LIMITS.maxHtmlBytes;
  const maxRedirects = opts?.maxRedirects ?? TRANSLATOR_SEARCH_LIMITS.maxRedirects;
  const timeoutMs = opts?.timeoutMs ?? TRANSLATOR_SEARCH_LIMITS.fetchTimeoutMs;

  let current = assertSafeHttpsUrlSync(rawUrl, { allowHttp: false });
  if (!current.ok) return current;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (controller.signal.aborted) {
        return { ok: false, code: "fetch_timeout", error: "Užklausos laikas baigėsi." };
      }

      const resolved = await resolvePublicIps(current.hostname, lookup);
      if (!resolved.ok) return resolved;
      const pinnedIp = resolved.ips[0]!;

      // Re-check pinned IP immediately before connect (defense in depth)
      if (isBlockedIpAddress(pinnedIp)) {
        return { ok: false, code: "dns_blocked_ip", error: "Hostname nurodo neviešą / rezervuotą IP." };
      }

      const url = new URL(current.canonicalHref);
      let res: PinnedHttpResponse;
      try {
        res = await pinnedRequest({
          url,
          pinnedIp,
          signal: controller.signal,
          headers: {
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "User-Agent": "KOT-Sales-TranslatorSearch/1.0",
            Connection: "close",
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const aborted = controller.signal.aborted || /abort/i.test(msg);
        return {
          ok: false,
          code: aborted ? "fetch_timeout" : "fetch_failed",
          error: aborted ? "Užklausos laikas baigėsi." : "Nepavyko gauti puslapio.",
        };
      }

      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location;
        discardResponseBody(res);
        if (!loc) {
          return { ok: false, code: "redirect_missing", error: "Redirect be Location." };
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(loc, current.canonicalHref);
        } catch {
          return { ok: false, code: "redirect_invalid", error: "Neteisingas redirect URL." };
        }
        if (nextUrl.protocol === "http:") {
          return { ok: false, code: "redirect_http", error: "HTTP redirect neleidžiamas." };
        }
        const next = assertSafeHttpsUrlSync(nextUrl.href, { allowHttp: false });
        if (!next.ok) return next;
        current = next;
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        discardResponseBody(res);
        return { ok: false, code: "http_status", error: `HTTP ${res.statusCode}.` };
      }

      const ctRaw = res.headers["content-type"];
      const ct = Array.isArray(ctRaw) ? ctRaw[0] : ctRaw;
      if (!contentTypeIsHtml(ct)) {
        discardResponseBody(res);
        return {
          ok: false,
          code: "mime_not_html",
          error: `Netinkamas MIME (tik text/html): ${ct ?? "nėra"}.`,
        };
      }

      const declared = Number(res.headers["content-length"] ?? NaN);
      if (Number.isFinite(declared) && declared > maxBytes) {
        discardResponseBody(res);
        return { ok: false, code: "body_too_large", error: "Atsakymas per didelis." };
      }

      const bodyRead = await readBodyWithLimit(
        res.body,
        maxBytes,
        controller.signal,
        () => discardResponseBody(res)
      );
      if (!bodyRead.ok) {
        discardResponseBody(res);
        return bodyRead;
      }

      const html = bodyRead.buf.toString("utf8");
      const finalUrl = current.canonicalHref;
      return {
        ok: true,
        finalUrl,
        canonicalUrl: canonicalizeUrl(finalUrl),
        contentType: ct ?? "text/html",
        html,
        titleHint: extractTitleHint(html),
        pinnedIp,
      };
    }

    return { ok: false, code: "too_many_redirects", error: "Per daug redirectų." };
  } finally {
    clearTimeout(timer);
  }
}
