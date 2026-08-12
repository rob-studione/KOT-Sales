#!/usr/bin/env node
/**
 * Vertėjų paieška core verification — imports REAL production modules (no logic copy).
 *
 * Run:
 *   npm run verify:translator-search
 *
 * Equivalent:
 *   node --import ./scripts/register-ts-path.mjs --experimental-strip-types scripts/verify-translator-search-core.mts
 *
 * Type-check:
 *   npm run verify:translator-search:types
 *
 * No live network / DB / OpenAI.
 */

import { authorizeTranslatorSearchAdmin } from "@/lib/translatorSearch/auth";
import { toSafeApiError } from "@/lib/translatorSearch/apiErrors";
import { decideCandidateMerge, computeDedupeKey } from "@/lib/translatorSearch/dedupe";
import { DbUpdateError, assertUpdateApplied, isUniqueViolation } from "@/lib/translatorSearch/dbUpdates";
import {
  groundExtractedCandidateAgainstPage,
  quoteExistsInPageText,
} from "@/lib/translatorSearch/evidenceGrounding";
import { canTransitionJobStatus } from "@/lib/translatorSearch/jobStatus";
import {
  failJobOrThrow,
  insertOrReuseCandidateByDedupe,
  listActiveJobsForActor,
  updateJobOrThrow,
  type TranslatorAdminClient,
} from "@/lib/translatorSearch/jobPersistence";
import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import {
  canAffordNextCall,
  estimateCallReserveEur,
  getTranslatorSearchPricing,
  requireTranslatorSearchPricing,
} from "@/lib/translatorSearch/pricing";
import { TranslatorSearchConfigError } from "@/lib/translatorSearch/model";
import { discardResponseBody, safeFetchHtmlCore } from "@/lib/translatorSearch/safeFetchCore";
import {
  assertSafeHttpsUrlSync,
  isBlockedIpAddress,
  isUuid,
  normalizeIpHostname,
  sanitizeWebsiteUrl,
} from "@/lib/translatorSearch/urlSafety";
import { validateTranslatorSearchRequest } from "@/lib/translatorSearch/validateRequest";

type FakeCrmUser = {
  id: string;
  email: string;
  role: "admin" | "sales" | "viewer";
  first_name: string;
  last_name: string;
  phone: string | null;
  status: "active" | "disabled";
  avatar_url: string | null;
};

const failures: string[] = [];

function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg);
}

// --- IP / URL (incl. bracketed IPv6 from URL.hostname) ---
check(normalizeIpHostname("[::1]") === "::1", "normalize bracketed loopback");
check(normalizeIpHostname("[2001:4860:4860::8888]") === "2001:4860:4860::8888", "normalize public v6");
check(isBlockedIpAddress("127.0.0.1"), "v4 loopback");
check(isBlockedIpAddress("::1"), "v6 loopback");
check(isBlockedIpAddress("[::1]"), "v6 loopback bracketed");
check(isBlockedIpAddress("0:0:0:0:0:0:0:1"), "v6 loopback alt");
check(isBlockedIpAddress("::ffff:127.0.0.1"), "v4-mapped loopback");
check(isBlockedIpAddress("::ffff:10.1.2.3"), "v4-mapped private");
check(isBlockedIpAddress("192.0.2.1"), "TEST-NET-1");
check(isBlockedIpAddress("198.51.100.1"), "TEST-NET-2");
check(isBlockedIpAddress("203.0.113.1"), "TEST-NET-3");
check(isBlockedIpAddress("198.18.0.1"), "benchmark v4");
check(isBlockedIpAddress("2001:db8::1"), "documentation v6");
check(isBlockedIpAddress("fe80::1"), "link-local v6");
check(isBlockedIpAddress("fc00::1"), "ULA v6");
check(isBlockedIpAddress("ff02::1"), "multicast v6");
check(!isBlockedIpAddress("8.8.8.8"), "public v4 ok");
check(!isBlockedIpAddress("2001:4860:4860::8888"), "public v6 ok");
check(!assertSafeHttpsUrlSync("https://127.0.0.1/").ok, "literal loopback url");
check(!assertSafeHttpsUrlSync("https://[::1]/").ok, "bracketed v6 loopback url sync");
check(!assertSafeHttpsUrlSync("https://[0:0:0:0:0:0:0:1]/").ok, "alt v6 loopback url sync");
{
  const pub = assertSafeHttpsUrlSync("https://[2001:4860:4860::8888]/");
  check(pub.ok === true, "public v6 literal sync ok");
  if (pub.ok) {
    check(pub.hostname === "2001:4860:4860::8888", "public v6 hostname debracketed");
  }
}
check(!assertSafeHttpsUrlSync("javascript:alert(1)").ok, "javascript scheme");
check(sanitizeWebsiteUrl("javascript:alert(1)") === null, "sanitize js url");
check(Boolean(sanitizeWebsiteUrl("https://example.com/a")?.startsWith("https://")), "sanitize https");

// --- Evidence grounding ---
const page = "Contact Jane Doe at jane@example.com for EN-NL sworn translation in Belgium.";
check(quoteExistsInPageText("jane@example.com", page), "quote exists");
check(!quoteExistsInPageText("not-in-page@x.com", page), "missing quote rejected");
const grounded = groundExtractedCandidateAgainstPage(
  {
    found: true,
    display_name: "Jane Doe",
    entity_type: "person",
    email: "jane@example.com",
    phone: null,
    country: "Belgium",
    city: null,
    language_pairs: [{ from: "EN", to: "NL" }],
    specializations: [],
    sworn_status: "claimed",
    website_url: "javascript:evil()",
    match_summary: "Good",
    evidence: [
      { field: "email", quote: "jane@example.com" },
      { field: "display_name", quote: "Jane Doe" },
      { field: "website_url", quote: "https://not-really-in-page.example" },
      { field: "match_summary", quote: "fabricated summary quote" },
    ],
  },
  page
);
check(grounded.email === "jane@example.com", "email kept with quote");
check(grounded.website_url === null, "javascript website cleared");
check(grounded.match_summary === null, "ungrounded summary cleared");
check(!grounded.evidence.some((e) => e.field === "match_summary"), "ungrounded evidence dropped");

// --- Job transitions ---
check(canTransitionJobStatus("pending", "running"), "pending→running");
check(canTransitionJobStatus("running", "failed"), "running→failed");
check(!canTransitionJobStatus("completed", "running"), "completed terminal");

// --- Auth + safe API ---
{
  const unauth = authorizeTranslatorSearchAdmin(null);
  check(!unauth.ok && unauth.status === 401, "401");
  const sales = authorizeTranslatorSearchAdmin({ role: "sales" } as FakeCrmUser);
  check(!sales.ok && sales.status === 403, "403");
  const admin = authorizeTranslatorSearchAdmin({
    role: "admin",
    id: "00000000-0000-4000-8000-000000000001",
    email: "a@b.c",
    first_name: "A",
    last_name: "B",
    phone: null,
    status: "active",
    avatar_url: null,
  });
  check(admin.ok === true, "admin");
}
const leaked = toSafeApiError("job_exception");
check(!/supabase|ECONNREFUSED|stack/i.test(leaked.error), "safe error no internals");
check(toSafeApiError("pricing_not_configured").code === "pricing_not_configured", "pricing code");
check(isUuid("550e8400-e29b-41d4-a716-446655440000"), "uuid ok");
check(!isUuid("not-a-uuid"), "uuid bad");

// --- Dedupe preserve review ---
const key = computeDedupeKey({ email: "a@b.com" });
const merge = decideCandidateMerge(key, {
  id: "1",
  dedupe_key: key,
  review_status: "approved",
  display_name: "A",
  entity_type: "person",
  email: "a@b.com",
  phone: null,
  country: null,
  city: null,
  language_pairs: [],
  specializations: [],
  sworn_status: "unknown",
  website_url: null,
  match_summary: null,
});
check(merge.preserveReview === true && merge.action === "reuse", "preserve approved");
check(isUniqueViolation({ code: "23505" }), "unique violation detect");

// --- DB update assert ---
try {
  assertUpdateApplied({ error: { message: "boom" }, count: null }, "db_update_terminal", "x");
  failures.push("expected assertUpdateApplied throw");
} catch (e) {
  check(e instanceof DbUpdateError && e.code === "db_update_terminal", "db update error code");
}

// --- Pricing: must be configured + model-matched; otherwise job must not start ---
{
  const prevModel = process.env.TRANSLATOR_SEARCH_MODEL;
  const prevPriceModel = process.env.TRANSLATOR_SEARCH_PRICE_MODEL;
  const prevPrice = process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M;
  delete process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M;
  delete process.env.TRANSLATOR_SEARCH_PRICE_MODEL;
  process.env.TRANSLATOR_SEARCH_MODEL = "test-model-a";
  check(getTranslatorSearchPricing().configured === false, "pricing unconfigured");
  try {
    requireTranslatorSearchPricing();
    failures.push("require pricing should throw");
  } catch (e) {
    check(
      e instanceof TranslatorSearchConfigError && e.code === "pricing_not_configured",
      "pricing_not_configured thrown"
    );
  }
  process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M = "in=1,out=2";
  process.env.TRANSLATOR_SEARCH_PRICE_MODEL = "old-model";
  check(getTranslatorSearchPricing().configured === false, "price model mismatch rejected");
  process.env.TRANSLATOR_SEARCH_PRICE_MODEL = "test-model-a";
  const okPricing = getTranslatorSearchPricing();
  check(okPricing.configured === true, "pricing configured with matching model");
  if (okPricing.configured) {
    const reserve = estimateCallReserveEur({
      pricing: okPricing,
      maxInputChars: 4000,
      maxOutputTokens: TRANSLATOR_SEARCH_LIMITS.maxExtractionOutputTokens,
    });
    check(reserve > 0 && Number.isFinite(reserve), "reserve from rates+tokens");
    check(
      canAffordNextCall({
        pricing: okPricing,
        spentEur: 0,
        maxBudgetEur: 5,
        maxInputChars: 4000,
        maxOutputTokens: TRANSLATOR_SEARCH_LIMITS.maxExtractionOutputTokens,
      }),
      "can afford with reserve"
    );
    check(
      !canAffordNextCall({
        pricing: okPricing,
        spentEur: 4.999,
        maxBudgetEur: 5,
        maxInputChars: 200_000,
        maxOutputTokens: TRANSLATOR_SEARCH_LIMITS.maxExtractionOutputTokens,
      }),
      "large reserve blocks call"
    );
  }
  check(
    !canAffordNextCall({
      pricing: { configured: false },
      spentEur: 0,
      maxBudgetEur: 5,
      maxInputChars: 100,
      maxOutputTokens: 100,
    }),
    "unconfigured pricing cannot afford"
  );
  if (prevModel === undefined) delete process.env.TRANSLATOR_SEARCH_MODEL;
  else process.env.TRANSLATOR_SEARCH_MODEL = prevModel;
  if (prevPriceModel === undefined) delete process.env.TRANSLATOR_SEARCH_PRICE_MODEL;
  else process.env.TRANSLATOR_SEARCH_PRICE_MODEL = prevPriceModel;
  if (prevPrice === undefined) delete process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M;
  else process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M = prevPrice;
}

// --- Validation ---
const badSeed = validateTranslatorSearchRequest({
  languageFrom: "EN",
  languageTo: "NL",
  country: "Belgium",
  certification: "required",
  candidateType: "freelancer",
  targetCandidates: 5,
  maxBudgetEur: 5,
  seedUrls: [],
});
check(!badSeed.ok && badSeed.code === "seed_urls_required_until_phase_c", "seed required");

// --- Fake fetch: redirect to private, DNS rebinding, slow body, body discard ---
async function* slowBody() {
  await new Promise((r) => setTimeout(r, 50));
  yield new TextEncoder().encode("<html><title>x</title><body>ok</body></html>");
}

{
  let redirectBodyDestroyed = false;
  const res = await safeFetchHtmlCore("https://example.com/start", {
    timeoutMs: 2000,
    lookup: async () => ["93.184.216.34"],
    pinnedRequest: async ({ url }) => {
      if (url.pathname === "/start") {
        return {
          statusCode: 302,
          headers: { location: "https://169.254.169.254/latest" },
          body: (async function* () {
            yield new TextEncoder().encode("redirect-body-should-be-discarded");
          })(),
          destroyBody: () => {
            redirectBodyDestroyed = true;
          },
        };
      }
      throw new Error("should not fetch metadata");
    },
  });
  check(
    !res.ok && (res.code === "url_blocked_host" || res.code === "dns_blocked_ip"),
    "redirect private blocked"
  );
  check(redirectBodyDestroyed, "redirect body destroyed");
}

{
  const res = await safeFetchHtmlCore("https://evil.example/", {
    lookup: async () => ["127.0.0.1"],
    pinnedRequest: async () => {
      throw new Error("must not connect");
    },
  });
  check(!res.ok && res.code === "dns_blocked_ip", "private dns blocked");
}

{
  let seenIp: string | null = null;
  const res = await safeFetchHtmlCore("https://example.com/page", {
    lookup: async () => ["93.184.216.34"],
    pinnedRequest: async ({ pinnedIp }) => {
      seenIp = pinnedIp;
      return {
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: (async function* () {
          yield new TextEncoder().encode("<html><title>T</title><body>hello</body></html>");
        })(),
      };
    },
  });
  check(res.ok && seenIp === "93.184.216.34", "pinned public IP used");
}

// Public IPv6 literal → pinned connection receives same IP (no DNS)
{
  let seenIp: string | null = null;
  const res = await safeFetchHtmlCore("https://[2001:4860:4860::8888]/", {
    lookup: async () => {
      throw new Error("DNS must not run for IP literal");
    },
    pinnedRequest: async ({ pinnedIp, url }) => {
      seenIp = pinnedIp;
      check(!String(url.hostname).includes("[") || normalizeIpHostname(url.hostname) === pinnedIp, "v6 host form");
      return {
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: (async function* () {
          yield new TextEncoder().encode("<html><title>v6</title><body>ok</body></html>");
        })(),
      };
    },
  });
  check(res.ok && seenIp === "2001:4860:4860::8888", "public v6 literal pinned");
}

{
  const res = await safeFetchHtmlCore("https://example.com/slow", {
    timeoutMs: 30,
    lookup: async () => ["93.184.216.34"],
    pinnedRequest: async () => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: slowBody(),
    }),
  });
  check(!res.ok && res.code === "fetch_timeout", "slow body timeout");
}

// Hung body: headers OK, but iterator.next() never resolves — must timeout + destroy
{
  let destroyed = false;
  let rejectPending: ((err: Error) => void) | null = null;
  const started = Date.now();
  const hung = safeFetchHtmlCore("https://example.com/hung-body", {
    timeoutMs: 40,
    lookup: async () => ["93.184.216.34"],
    pinnedRequest: async () => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return new Promise<IteratorResult<Uint8Array>>((_resolve, reject) => {
                rejectPending = reject;
              });
            },
            return() {
              if (rejectPending) {
                rejectPending(Object.assign(new Error("aborted"), { name: "AbortError" }));
                rejectPending = null;
              }
              return Promise.resolve({ done: true, value: undefined });
            },
          };
        },
      },
      destroyBody: () => {
        destroyed = true;
        if (rejectPending) {
          rejectPending(Object.assign(new Error("aborted"), { name: "AbortError" }));
          rejectPending = null;
        }
      },
    }),
  });
  const res = await hung;
  const elapsed = Date.now() - started;
  check(!res.ok && res.code === "fetch_timeout", "hung body next → fetch_timeout");
  check(destroyed, "hung body destroyBody called");
  check(elapsed < 1500, "hung body returned within limited time");
}

{
  let destroyed = false;
  discardResponseBody({
    statusCode: 302,
    headers: {},
    body: (async function* () {})(),
    destroyBody: () => {
      destroyed = true;
    },
  });
  check(destroyed, "discardResponseBody calls destroyBody");
}

// --- Real terminal job update failure (production updateJobOrThrow / failJobOrThrow) ---
{
  const failingTerminalAdmin: TranslatorAdminClient = {
    from() {
      return {
        update() {
          return this;
        },
        eq() {
          return this;
        },
        select() {
          return Promise.resolve({ data: [], error: null });
        },
      } as never;
    },
  };
  let threwTerminal = false;
  try {
    await updateJobOrThrow(
      failingTerminalAdmin,
      "00000000-0000-4000-8000-000000000099",
      { status: "completed", finished_at: new Date().toISOString() },
      "db_update_terminal"
    );
  } catch (e) {
    threwTerminal = e instanceof DbUpdateError && e.code === "db_update_terminal";
  }
  check(threwTerminal, "real terminal updateJobOrThrow failure");

  let threwFail = false;
  try {
    await failJobOrThrow(failingTerminalAdmin, "00000000-0000-4000-8000-000000000099", "job_exception");
  } catch (e) {
    threwFail = e instanceof DbUpdateError && e.code === "db_update_terminal";
  }
  check(threwFail, "real failJobOrThrow terminal failure");
}

// --- activeJobs / loadCandidateByDedupe DB read errors are not "not found" ---
{
  const readFailAdmin: TranslatorAdminClient = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        gte() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: null, error: { message: "connection reset by peer", code: "PGRST000" } });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: { message: "connection reset by peer", code: "PGRST000" } });
        },
      } as never;
    },
  };
  let activeThrew = false;
  try {
    await listActiveJobsForActor(readFailAdmin, "actor", new Date().toISOString());
  } catch (e) {
    activeThrew = e instanceof DbUpdateError && e.code === "db_read";
  }
  check(activeThrew, "activeJobs DB error throws db_read");
}

// --- Real dedupe 23505 recovery stream (production insertOrReuseCandidateByDedupe) ---
{
  const existing = {
    id: "11111111-1111-4111-8111-111111111111",
    dedupe_key: "email:dup@example.com",
    review_status: "pending" as const,
    display_name: "Dup",
    entity_type: "person" as const,
    email: "dup@example.com",
    phone: null,
    country: "Belgium",
    city: null,
    language_pairs: [],
    specializations: [],
    sworn_status: "unknown" as const,
    website_url: null,
    match_summary: null,
  };
  let insertAttempts = 0;
  const conflictAdmin: TranslatorAdminClient = {
    from(table: string) {
      if (table === "translator_candidates") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            // First call (pre-insert): not found; after 23505: found
            if (insertAttempts === 0) {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: existing, error: null });
          },
          insert() {
            return this;
          },
          single() {
            insertAttempts += 1;
            return Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            });
          },
        } as never;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const result = await insertOrReuseCandidateByDedupe(conflictAdmin, existing.dedupe_key, {
    display_name: "Dup",
    entity_type: "person",
    email: "dup@example.com",
    phone: null,
    country: "Belgium",
    city: null,
    language_pairs: [],
    specializations: [],
    sworn_status: "unknown",
    website_url: null,
    match_summary: null,
    dedupe_key: existing.dedupe_key,
  });
  check(result.reused === true && result.created === false, "23505 recovery reused");
  check(result.candidateId === existing.id, "23505 recovery id");
  check(insertAttempts === 1, "23505 insert attempted once");
}

// Safe API must not echo internal DB text
{
  const safe = toSafeApiError("db_read");
  check(safe.error === "Nepavyko nuskaityti duomenų.", "db_read safe LT");
  check(!/connection reset|PGRST/i.test(safe.error), "no internal db text in API");
}

if (failures.length) {
  console.error("verify-translator-search-core: FAILED");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-translator-search-core: ok");
