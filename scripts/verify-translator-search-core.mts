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

import {
  CANDIDATE_TYPE_MISMATCH_CODE,
  CANDIDATE_TYPE_MISMATCH_WARNING,
  isTargetReached,
  looksLikeNonPersonTranslatorName,
  matchesTranslatorCandidateTypeFilter,
  nextFoundCandidatesAfterMatch,
} from "@/lib/translatorSearch/candidateTypeMatch";
import { authorizeTranslatorSearchAction } from "@/lib/translatorSearch/auth";
import { toSafeApiError } from "@/lib/translatorSearch/apiErrors";
import { buildTranslatorSearchQueries } from "@/lib/translatorSearch/buildSearchQueries";
import { collectTranslatorSourceUrls } from "@/lib/translatorSearch/collectSourceUrls";
import { decideCandidateMerge, computeDedupeKey } from "@/lib/translatorSearch/dedupe";
import { DbUpdateError, assertUpdateApplied, isUniqueViolation } from "@/lib/translatorSearch/dbUpdates";
import { discoverTranslatorSources } from "@/lib/translatorSearch/discoverSources";
import {
  groundExtractedCandidateAgainstPage,
  quoteExistsInPageText,
} from "@/lib/translatorSearch/evidenceGrounding";
import {
  canStartTimedAction,
  createJobDeadline,
} from "@/lib/translatorSearch/jobDeadline";
import { canTransitionJobStatus } from "@/lib/translatorSearch/jobStatus";
import {
  buildTranslatorSearchJobMetricFields,
  failJobOrThrow,
  insertOrReuseCandidateByDedupe,
  listActiveJobsForActor,
  updateJobOrThrow,
  type TranslatorAdminClient,
} from "@/lib/translatorSearch/jobPersistence";
import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import {
  assessWebSearchCallCost,
  isTranslatorSearchBudgetEnforced,
  TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING,
} from "@/lib/translatorSearch/costAssessment";
import { evaluateWebSearchResponse } from "@/lib/translatorSearch/evaluateWebSearch";
import { buildTranslatorSearchOpenAiRequestOptions } from "@/lib/translatorSearch/openaiRequestOptions";
import {
  canAffordNextCall,
  canAffordWebSearchCall,
  estimateCallReserveEur,
  estimateTranslatorSearchCostEur,
  estimateWebSearchReserveEur,
  getTranslatorSearchPricing,
  requireTranslatorSearchPricing,
} from "@/lib/translatorSearch/pricing";
import { TranslatorSearchConfigError } from "@/lib/translatorSearch/model";
import { discardResponseBody, safeFetchDocumentCore, safeFetchHtmlCore } from "@/lib/translatorSearch/safeFetchCore";
import {
  bufferLooksLikePdf,
  extractPdfTextFromBuffer,
  resolvePdfPageFromEvidence,
} from "@/lib/translatorSearch/pdfText";
import { resolveTranslatorStopReason } from "@/lib/translatorSearch/stopReason";
import {
  assertSafeHttpsUrlSync,
  isBlockedIpAddress,
  isUuid,
  normalizeIpHostname,
  sanitizeWebsiteUrl,
} from "@/lib/translatorSearch/urlSafety";
import { validateTranslatorSearchRequest } from "@/lib/translatorSearch/validateRequest";
import {
  buildWebSearchCreateParams,
  countWebSearchActions,
  extractWebSearchAssistantText,
  parseWebSearchActionSourceUrls,
  webSearchInputCharCount,
} from "@/lib/translatorSearch/webSearchParse";
import type { TranslatorSearchRequestParams } from "@/lib/translatorSearch/types";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const unauth = authorizeTranslatorSearchAction(null, "tools.translator_search.run");
  check(!unauth.ok && unauth.status === 401, "401");
  const sales = authorizeTranslatorSearchAction(
    {
      role: "sales",
      id: "00000000-0000-4000-8000-000000000002",
      email: "s@b.c",
      first_name: "S",
      last_name: "A",
      phone: null,
      status: "active",
      avatar_url: null,
      permissionKeys: [],
    } as FakeCrmUser,
    "tools.translator_search.run"
  );
  check(!sales.ok && sales.status === 403, "403");
  const admin = authorizeTranslatorSearchAction(
    {
      role: "admin",
      id: "00000000-0000-4000-8000-000000000001",
      email: "a@b.c",
      first_name: "A",
      last_name: "B",
      phone: null,
      status: "active",
      avatar_url: null,
      permissionKeys: ["tools.translator_search.run"],
    } as FakeCrmUser,
    "tools.translator_search.run"
  );
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
  const prevWeb = process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL;
  delete process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M;
  delete process.env.TRANSLATOR_SEARCH_PRICE_MODEL;
  delete process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL;
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
  process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL = "0.01";
  check(getTranslatorSearchPricing().configured === false, "price model mismatch rejected");
  process.env.TRANSLATOR_SEARCH_PRICE_MODEL = "test-model-a";
  delete process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL;
  check(getTranslatorSearchPricing().configured === false, "web search price required");
  process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL = "0.025";
  const okPricing = getTranslatorSearchPricing();
  check(okPricing.configured === true, "pricing configured with matching model");
  if (okPricing.configured) {
    check(okPricing.webSearchPriceEurPerCall === 0.025, "web search per-call price");
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
    const webReserve = estimateWebSearchReserveEur({ pricing: okPricing });
    check(webReserve > okPricing.webSearchPriceEurPerCall, "web reserve includes tool+tokens+context");
    check(
      canAffordWebSearchCall({ pricing: okPricing, spentEur: 0, maxBudgetEur: 5 }),
      "can afford web search"
    );
    check(
      !canAffordWebSearchCall({
        pricing: okPricing,
        spentEur: 5 - webReserve + 0.000001,
        maxBudgetEur: 5,
      }),
      "budget blocks web search before exceed"
    );
    const billed = estimateTranslatorSearchCostEur({
      pricing: okPricing,
      usage: { input_tokens: 1_000_000, output_tokens: 0, total_tokens: 1_000_000 },
      searchActions: 2,
    });
    check(billed.cost_eur !== null && Math.abs((billed.cost_eur ?? 0) - (1 + 0.05)) < 1e-9, "tokens+2*tool billed");
  }
  process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL = "0";
  check(getTranslatorSearchPricing().configured === false, "zero web-search price rejected");
  process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL = "0.025";
  process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M = "in=0,out=2";
  check(getTranslatorSearchPricing().configured === false, "zero input price rejected");
  process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M = "in=1,out=2";
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
  if (prevWeb === undefined) delete process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL;
  else process.env.TRANSLATOR_SEARCH_WEB_SEARCH_PRICE_EUR_PER_CALL = prevWeb;
}

// --- Validation (C1: 0–3 seeds) ---
const noSeedOk = validateTranslatorSearchRequest({
  languageFrom: "EN",
  languageTo: "NL",
  country: "Belgium",
  certification: "required",
  candidateType: "freelancer",
  targetCandidates: 5,
  maxBudgetEur: 5,
  seedUrls: [],
});
check(noSeedOk.ok === true, "0 seeds allowed in C1");
if (noSeedOk.ok) {
  check(noSeedOk.params.seedUrls.length === 0, "empty seed list");
  check(noSeedOk.params.appliedLimits.maxPdfFiles === TRANSLATOR_SEARCH_LIMITS.maxPdfFiles, "appliedLimits.maxPdfFiles");
  check(noSeedOk.params.appliedLimits.maxPdfBytes === TRANSLATOR_SEARCH_LIMITS.maxPdfBytes, "appliedLimits.maxPdfBytes");
  check(
    noSeedOk.params.appliedLimits.maxPdfPagesTotal === TRANSLATOR_SEARCH_LIMITS.maxPdfPagesTotal,
    "appliedLimits.maxPdfPagesTotal"
  );
}

const threeSeeds = validateTranslatorSearchRequest({
  languageFrom: "EN",
  languageTo: "NL",
  country: "Belgium",
  certification: "required",
  candidateType: "freelancer",
  targetCandidates: 5,
  maxBudgetEur: 5,
  seedUrls: [
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
  ],
});
check(threeSeeds.ok === true, "3 seeds ok");

const fourSeeds = validateTranslatorSearchRequest({
  languageFrom: "EN",
  languageTo: "NL",
  country: "Belgium",
  certification: "required",
  candidateType: "freelancer",
  targetCandidates: 5,
  maxBudgetEur: 5,
  seedUrls: [
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
    "https://example.com/d",
  ],
});
check(!fourSeeds.ok && fourSeeds.code === "validation_seed_urls_count", "4 seeds rejected");

const missingCriteria = validateTranslatorSearchRequest({
  languageFrom: "",
  languageTo: "NL",
  country: "Belgium",
  seedUrls: [],
});
check(!missingCriteria.ok, "criteria still required");

// --- C1 query builder / web_search parse / discover ---
{
  const qs = buildTranslatorSearchQueries({
    languageFrom: "English",
    languageTo: "Dutch",
    country: "Belgium",
    city: "Brussels",
    certification: "required",
    specialization: "legal",
    candidateType: "freelancer",
  });
  check(qs.length >= 1 && qs.length <= 3, "max 3 deterministic queries");
  check(qs.every((q) => q.includes("English") && q.includes("Dutch")), "queries include languages");

  const createParams = buildWebSearchCreateParams({ model: "test-model-a", query: qs[0]! });
  check(createParams.tool_choice === "required", "tool_choice required");
  check(createParams.max_tool_calls === 1, "max_tool_calls 1");
  check(createParams.tools[0]?.type === "web_search", "web_search tool");
  check(createParams.tools[0]?.search_context_size === "low", "search_context_size low");
  check(
    createParams.include.includes("web_search_call.action.sources"),
    "include action.sources"
  );

  const fixtureOutput = [
    {
      type: "web_search_call",
      id: "ws_1",
      status: "completed",
      action: {
        type: "search",
        query: "q",
        sources: [
          { type: "url", url: "https://example.com/translator" },
          { type: "url", url: "https://127.0.0.1/private" },
          { type: "url", url: "not-a-url" },
          { type: "url", url: "https://example.com/translator" },
        ],
      },
    },
    {
      type: "web_search_call",
      id: "ws_2",
      status: "completed",
      action: { type: "open_page", url: "https://example.com/opened-not-source" },
    },
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "FAKE EVIDENCE: Jane Doe sworn translator email jane@evil.test",
        },
      ],
    },
  ];

  check(countWebSearchActions(fixtureOutput) === 1, "search_calls count only search actions");
  const parsedUrls = parseWebSearchActionSourceUrls(fixtureOutput);
  check(parsedUrls.includes("https://example.com/translator"), "parsed public source");
  check(parsedUrls.includes("https://127.0.0.1/private"), "raw private still in parse list");
  check(!parsedUrls.includes("https://example.com/opened-not-source"), "open_page url ignored");
  const assistantText = extractWebSearchAssistantText(fixtureOutput);
  check(/FAKE EVIDENCE/.test(assistantText), "assistant text present in fixture");

  const collected = collectTranslatorSourceUrls({
    seedUrls: ["https://example.com/seed"],
    webUrls: parsedUrls,
    maxUnique: 30,
  });
  check(
    collected.sources.some((s) => s.sourceType === "manual" && s.canonicalUrl.includes("seed")),
    "seed remains manual"
  );
  check(
    collected.sources.some((s) => s.sourceType === "web" && s.canonicalUrl.includes("translator")),
    "web source typed web"
  );
  check(
    !collected.sources.some((s) => s.canonicalUrl.includes("127.0.0.1")),
    "private URL dropped before fetch"
  );
  check(collected.droppedUnsafe >= 1, "unsafe dropped counted");

  // Web text must not become candidate evidence — grounding still requires page quotes.
  const groundedFromWebText = groundExtractedCandidateAgainstPage(
    {
      found: true,
      display_name: "Jane Doe",
      entity_type: "person",
      email: "jane@evil.test",
      phone: null,
      country: "Belgium",
      city: null,
      language_pairs: [],
      specializations: [],
      sworn_status: "claimed",
      website_url: null,
      match_summary: "from search",
      evidence: [{ field: "email", quote: "jane@evil.test" }],
    },
    "Real page without those tokens."
  );
  check(groundedFromWebText.email === null, "web assistant text cannot ground email");
}

{
  const baseRequest: TranslatorSearchRequestParams = {
    languageFrom: "English",
    languageTo: "Dutch",
    country: "Belgium",
    city: null,
    certification: "required",
    specialization: null,
    candidateType: "freelancer",
    targetCandidates: 5,
    maxBudgetEur: 5,
    seedUrls: ["https://example.com/seed-only"],
    appliedLimits: {
      maxSeedUrls: 3,
      maxFetchUrls: 20,
      maxExtractionCalls: 10,
      maxCharsPerSource: 40000,
      maxBudgetEur: 5,
      maxWebSearchCalls: 3,
      maxUniqueSourceUrls: 30,
      maxPdfFiles: 3,
      maxPdfBytes: 10485760,
      maxPdfPagesTotal: 30,
    },
  };

  const pricing = {
    configured: true as const,
    model: "test-model-a",
    inEurPer1m: 1,
    outEurPer1m: 2,
    webSearchPriceEurPerCall: 0.025,
  };

  const failedDiscover = await discoverTranslatorSources({
    request: baseRequest,
    pricing,
    runWebSearch: async () => ({
      ok: false,
      code: "web_search_failed",
      searchActions: 0,
      costFullyKnown: false,
      knownCostEur: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    }),
  });
  check(failedDiscover.webSearchFailed === true, "web search failure flagged");
  check(failedDiscover.openaiCalls === 1, "unknown-cost failure stops further searches");
  check(failedDiscover.costUnknown === true, "unknown cost flagged");
  check(
    failedDiscover.sources.some((s) => s.sourceType === "manual"),
    "seed continues after web failure"
  );
  check(
    failedDiscover.warnings.some((w) => /seed/i.test(w)),
    "safe warning when web fails with seed"
  );
  check(failedDiscover.searchCalls === 0, "search_calls stay 0 when no search actions");

  let searchRuns = 0;
  const okDiscover = await discoverTranslatorSources({
    request: { ...baseRequest, seedUrls: [] },
    pricing,
    runWebSearch: async () => {
      searchRuns += 1;
      return {
        ok: true,
        sourceUrls: [
          "https://example.com/from-web",
          "https://169.254.169.254/meta",
          "ftp://example.com/nope",
        ],
        searchActions: 1,
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
        costFullyKnown: true,
        knownCostEur: 0.025 + (100 / 1_000_000) * 1 + (20 / 1_000_000) * 2,
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        assistantTextIgnored: "MUST NOT BE EVIDENCE Jane Doe jane@evil.test",
      };
    },
  });
  check(searchRuns >= 1 && searchRuns <= 3, "web search runner called within limit");
  check(okDiscover.searchCalls === searchRuns, "search_calls = factual search actions");
  check(okDiscover.openaiCalls === searchRuns, "openai_calls = Responses calls");
  check(
    okDiscover.sources.every((s) => s.sourceType === "web"),
    "discovered sources are web"
  );
  check(
    !okDiscover.sources.some((s) => /169\.254|ftp:/i.test(s.canonicalUrl)),
    "bad scheme/private excluded from fetch plan"
  );
  check(okDiscover.costEur > 0, "token+tool cost accumulated");
  check(okDiscover.costUnknown === false, "fully known search keeps cost known");

  const budgetBlocked = await discoverTranslatorSources({
    request: { ...baseRequest, maxBudgetEur: 0.000001, seedUrls: ["https://example.com/seed-budget"] },
    pricing,
    runWebSearch: async () => {
      throw new Error("must not call web search when budget blocks");
    },
  });
  check(budgetBlocked.webSearchAttempted === false, "budget stops before web search call");
  check(budgetBlocked.costLimit === true, "budget sets costLimit flag");
  check(
    resolveTranslatorStopReason({
      costLimit: budgetBlocked.costLimit,
      timeLimit: budgetBlocked.timeLimit,
      sourceLimit: budgetBlocked.sourceLimit,
    }) === "cost_limit",
    "budget reserve → cost_limit not no_more_sources"
  );
  check(
    budgetBlocked.sources.some((s) => s.sourceType === "manual"),
    "seed path intact when web skipped by budget"
  );
}

// --- C1 hardening: deadline, field length, unknown-cost stop, partial keep ---
{
  const pricing = {
    configured: true as const,
    model: "test-model-a",
    inEurPer1m: 1,
    outEurPer1m: 2,
    webSearchPriceEurPerCall: 0.025,
  };
  const baseRequest: TranslatorSearchRequestParams = {
    languageFrom: "English",
    languageTo: "Dutch",
    country: "Belgium",
    city: null,
    certification: "required",
    specialization: null,
    candidateType: "freelancer",
    targetCandidates: 5,
    maxBudgetEur: 5,
    seedUrls: ["https://example.com/seed-partial"],
    appliedLimits: {
      maxSeedUrls: 3,
      maxFetchUrls: 20,
      maxExtractionCalls: 10,
      maxCharsPerSource: 40000,
      maxBudgetEur: 5,
      maxWebSearchCalls: 3,
      maxUniqueSourceUrls: 30,
      maxPdfFiles: 3,
      maxPdfBytes: 10485760,
      maxPdfPagesTotal: 30,
    },
  };

  const pastDeadline = createJobDeadline(Date.now() - TRANSLATOR_SEARCH_LIMITS.jobInternalDeadlineMs - 1_000);
  check(
    !canStartTimedAction({
      deadline: pastDeadline,
      preferredTimeoutMs: TRANSLATOR_SEARCH_LIMITS.openaiWebSearchTimeoutMs,
    }).ok,
    "deadline blocks search start"
  );
  check(
    !canStartTimedAction({
      deadline: pastDeadline,
      preferredTimeoutMs: TRANSLATOR_SEARCH_LIMITS.fetchTimeoutMs,
    }).ok,
    "deadline blocks fetch start"
  );
  check(
    !canStartTimedAction({
      deadline: pastDeadline,
      preferredTimeoutMs: TRANSLATOR_SEARCH_LIMITS.openaiExtractionTimeoutMs,
    }).ok,
    "deadline blocks extraction start"
  );

  const deadlineDiscover = await discoverTranslatorSources({
    request: baseRequest,
    pricing,
    deadline: pastDeadline,
    runWebSearch: async () => {
      throw new Error("must not search after deadline");
    },
  });
  check(deadlineDiscover.timeLimit === true, "discover timeLimit before search");
  check(deadlineDiscover.webSearchAttempted === false, "no search after deadline");
  check(
    resolveTranslatorStopReason({ timeLimit: true }) === "time_limit",
    "deadline → time_limit"
  );
  check(
    deadlineDiscover.sources.some((s) => s.sourceType === "manual"),
    "partial seed remains after deadline"
  );

  const longLang = "L".repeat(TRANSLATOR_SEARCH_LIMITS.maxLanguageFieldChars + 1);
  const longCriteria = validateTranslatorSearchRequest({
    languageFrom: longLang,
    languageTo: "NL",
    country: "Belgium",
    certification: "any",
    candidateType: "any",
    targetCandidates: 5,
    maxBudgetEur: 5,
    seedUrls: [],
  });
  check(
    !longCriteria.ok && longCriteria.code === "validation_language_from_length",
    "overlong language rejected"
  );

  const fresh = createJobDeadline();
  const gated = canStartTimedAction({
    deadline: fresh,
    preferredTimeoutMs: TRANSLATOR_SEARCH_LIMITS.openaiWebSearchTimeoutMs,
  });
  check(gated.ok === true, "fresh deadline allows search");
  if (gated.ok) {
    check(
      gated.timeoutMs <= TRANSLATOR_SEARCH_LIMITS.openaiWebSearchTimeoutMs,
      "openai timeout capped by preferred"
    );
    check(gated.timeoutMs <= TRANSLATOR_SEARCH_LIMITS.jobInternalDeadlineMs, "timeout within deadline");
  }

  let unknownCostRuns = 0;
  const unknownCostDiscover = await discoverTranslatorSources({
    request: { ...baseRequest, seedUrls: [] },
    pricing,
    runWebSearch: async () => {
      unknownCostRuns += 1;
      return {
        ok: false,
        code: "web_search_failed",
        searchActions: 0,
        costFullyKnown: false,
        knownCostEur: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      };
    },
  });
  check(unknownCostRuns === 1, "no further searches after unknown-cost failure");
  check(unknownCostDiscover.openaiCalls === 1, "openai_calls still counted");
  check(unknownCostDiscover.costEur === 0, "unknown cost not treated as precise amount");
  check(unknownCostDiscover.costUnknown === true, "costUnknown after bare failure");
  check(
    isTranslatorSearchBudgetEnforced(unknownCostDiscover.costUnknown) === false,
    "budget_enforced=false when costUnknown"
  );
  check(
    unknownCostDiscover.warnings.some((w) => w === TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING),
    "unknown-cost warning text present"
  );

  let partialRuns = 0;
  const partialDiscover = await discoverTranslatorSources({
    request: { ...baseRequest, seedUrls: [] },
    pricing,
    runWebSearch: async () => {
      partialRuns += 1;
      if (partialRuns === 1) {
        return {
          ok: true,
          sourceUrls: ["https://example.com/kept-partial"],
          searchActions: 1,
          usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 },
          costFullyKnown: true,
          knownCostEur: 0.025 + (50 / 1_000_000) * 1 + (10 / 1_000_000) * 2,
          input_tokens: 50,
          output_tokens: 10,
          total_tokens: 60,
        };
      }
      return {
        ok: false,
        code: "web_search_failed",
        searchActions: 0,
        costFullyKnown: false,
        knownCostEur: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      };
    },
  });
  check(partialRuns === 2, "second search attempted after success then stopped");
  check(
    partialDiscover.sources.some((s) => s.canonicalUrl.includes("kept-partial")),
    "partial web results retained"
  );
  check(partialDiscover.openaiCalls === 2, "openai_calls include failed follow-up");
  check(partialDiscover.costUnknown === true, "follow-up unknown cost marks job");

  let billedIncompleteRuns = 0;
  const incompleteBilled = await discoverTranslatorSources({
    request: { ...baseRequest, seedUrls: ["https://example.com/seed-after-incomplete"] },
    pricing,
    runWebSearch: async () => {
      billedIncompleteRuns += 1;
      return {
        ok: false,
        code: "web_search_incomplete",
        searchActions: 1,
        usage: { input_tokens: 1000, output_tokens: 0, total_tokens: 1000 },
        costFullyKnown: true,
        knownCostEur: 0.025 + 1000 / 1_000_000,
        input_tokens: 1000,
        output_tokens: 0,
        total_tokens: 1000,
      };
    },
  });
  check(billedIncompleteRuns === 1, "incomplete billed search does not continue");
  check(incompleteBilled.searchCalls === 1, "incomplete search actions counted");
  check(incompleteBilled.costEur > 0, "incomplete known usage billed");
  check(incompleteBilled.costUnknown === false, "fully known incomplete keeps cost known");
  check(
    !incompleteBilled.sources.some((s) => s.sourceType === "web"),
    "incomplete sources not used"
  );
  check(
    incompleteBilled.sources.some((s) => s.sourceType === "manual"),
    "seed continues after incomplete billed search"
  );

  const qs = buildTranslatorSearchQueries({
    languageFrom: "English",
    languageTo: "Dutch",
    country: "Belgium",
    city: "Brussels",
    certification: "required",
    specialization: "legal",
    candidateType: "freelancer",
  });
  check(
    qs.every((q) => webSearchInputCharCount(q) <= TRANSLATOR_SEARCH_LIMITS.maxWebSearchPromptChars),
    "built queries fit web-search prompt reserve"
  );
}

// --- C1.1: maxRetries=0, action count, partial cost semantics ---
{
  const pricing = {
    configured: true as const,
    model: "test-model-a",
    inEurPer1m: 1,
    outEurPer1m: 2,
    webSearchPriceEurPerCall: 0.025,
  };
  const opts = buildTranslatorSearchOpenAiRequestOptions(12_000);
  check(opts.maxRetries === 0, "OpenAI request options maxRetries=0");
  check(opts.timeout === 12_000, "OpenAI request options timeout passthrough");

  const zeroActions = evaluateWebSearchResponse({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "no tool" }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    pricing,
  });
  check(zeroActions.ok === false, "completed + 0 search actions is not success");
  check(zeroActions.sourceUrls.length === 0, "no sources on bad action count");
  check(zeroActions.costFullyKnown === false, "usage without one action → cost unknown");
  check(zeroActions.knownCostEur > 0, "token portion still known");

  const actionNoUsage = assessWebSearchCallCost({
    pricing,
    usage: null,
    searchActions: 1,
  });
  check(actionNoUsage.costFullyKnown === false, "action without usage → not fully known");
  check(
    Math.abs(actionNoUsage.knownCostEur - 0.025) < 1e-9,
    "action without usage → tool portion known"
  );

  const usageNoAction = assessWebSearchCallCost({
    pricing,
    usage: { input_tokens: 1_000_000, output_tokens: 0, total_tokens: 1_000_000 },
    searchActions: 0,
  });
  check(usageNoAction.costFullyKnown === false, "usage without action → not fully known");
  check(Math.abs(usageNoAction.knownCostEur - 1) < 1e-9, "usage without action → token portion");

  const full = assessWebSearchCallCost({
    pricing,
    usage: { input_tokens: 1_000_000, output_tokens: 0, total_tokens: 1_000_000 },
    searchActions: 1,
  });
  check(full.costFullyKnown === true, "usage + exactly one action → fully known");
  check(Math.abs(full.knownCostEur - 1.025) < 1e-9, "full web-search cost");

  const twoActions = evaluateWebSearchResponse({
    status: "completed",
    output: [
      {
        type: "web_search_call",
        action: { type: "search", query: "a", sources: [{ type: "url", url: "https://example.com/a" }] },
      },
      {
        type: "web_search_call",
        action: { type: "search", query: "b", sources: [{ type: "url", url: "https://example.com/b" }] },
      },
    ],
    usage: { input_tokens: 100, output_tokens: 0, total_tokens: 100 },
    pricing,
  });
  check(twoActions.ok === false, "completed + 2 search actions is not success");
  check(twoActions.sourceUrls.length === 0, "sources dropped when action count != 1");

  const baseRequest: TranslatorSearchRequestParams = {
    languageFrom: "English",
    languageTo: "Dutch",
    country: "Belgium",
    city: null,
    certification: "required",
    specialization: null,
    candidateType: "freelancer",
    targetCandidates: 5,
    maxBudgetEur: 5,
    seedUrls: ["https://example.com/seed-c11"],
    appliedLimits: {
      maxSeedUrls: 3,
      maxFetchUrls: 20,
      maxExtractionCalls: 10,
      maxCharsPerSource: 40000,
      maxBudgetEur: 5,
      maxWebSearchCalls: 3,
      maxUniqueSourceUrls: 30,
      maxPdfFiles: 3,
      maxPdfBytes: 10485760,
      maxPdfPagesTotal: 30,
    },
  };

  let actionOnlyRuns = 0;
  const actionOnlyDiscover = await discoverTranslatorSources({
    request: baseRequest,
    pricing,
    runWebSearch: async () => {
      actionOnlyRuns += 1;
      return {
        ok: true,
        sourceUrls: ["https://example.com/from-partial-cost"],
        searchActions: 1,
        costFullyKnown: false,
        knownCostEur: 0.025,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      };
    },
  });
  check(actionOnlyRuns === 1, "partial-cost success stops further search");
  check(actionOnlyDiscover.costUnknown === true, "action-only → costUnknown");
  check(actionOnlyDiscover.costLimit === true, "costUnknown uses cost_limit flag");
  check(
    actionOnlyDiscover.sources.some((s) => s.canonicalUrl.includes("from-partial-cost")),
    "partial-cost success still keeps sources"
  );
  check(
    actionOnlyDiscover.sources.some((s) => s.sourceType === "manual"),
    "seed remains with partial-cost web"
  );
  check(
    isTranslatorSearchBudgetEnforced(actionOnlyDiscover.costUnknown) === false,
    "final budget_enforced=false"
  );
  check(
    Math.abs(actionOnlyDiscover.costEur - 0.025) < 1e-9,
    "only known tool portion counted"
  );
}

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

// --- C2.1 terminal metric patches include pdf_count ---
{
  const completedMetrics = buildTranslatorSearchJobMetricFields({
    search_calls: 1,
    fetch_url_count: 2,
    pdf_count: 1,
    openai_calls: 3,
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    cost_eur_estimated: 0.01,
  });
  check(completedMetrics.pdf_count === 1, "completed metrics include pdf_count");
  check(
    Object.keys(completedMetrics).sort().join(",") ===
      "cost_eur_estimated,fetch_url_count,input_tokens,openai_calls,output_tokens,pdf_count,search_calls,total_tokens",
    "completed metric field set"
  );

  let failedPatch: Record<string, unknown> | null = null;
  const captureAdmin: TranslatorAdminClient = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          failedPatch = patch;
          return this;
        },
        eq() {
          return this;
        },
        select() {
          return Promise.resolve({ data: [{ id: "ok" }], error: null });
        },
      } as never;
    },
  };
  await failJobOrThrow(captureAdmin, "00000000-0000-4000-8000-000000000099", "job_exception", {
    search_calls: 2,
    fetch_url_count: 4,
    pdf_count: 2,
    openai_calls: 1,
    input_tokens: 1,
    output_tokens: 1,
    total_tokens: 2,
    cost_eur_estimated: 0.02,
    warning: null,
  });
  const patch = failedPatch as Record<string, unknown> | null;
  check(patch !== null && patch.pdf_count === 2, "failed terminal patch stores pdf_count");
  check(patch !== null && patch.status === "failed", "failed terminal status");
  check(patch !== null && patch.fetch_url_count === 4, "failed terminal fetch preserved");
}

// --- C2.1 PDF limit stop reasons ---
{
  check(
    resolveTranslatorStopReason({ sourceLimit: true }) === "source_limit",
    "PDF file/page limit flag → source_limit"
  );
  check(
    resolveTranslatorStopReason({ sourceLimit: true }) !== "no_more_sources",
    "PDF limit is not no_more_sources"
  );
  check(
    resolveTranslatorStopReason({}) === "no_more_sources",
    "no limit flags → no_more_sources"
  );
  // Rejected PDF must not advance found / target
  let found = 0;
  found = nextFoundCandidatesAfterMatch({ foundSoFar: found, accepted: false });
  check(found === 0 && !isTargetReached({ foundCandidates: found, targetCandidates: 1 }), "rejected PDF ≠ target");
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

// --- C1.2 candidate type match (symmetric filter) ---
{
  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "freelancer",
      entityType: "person",
      displayName: "Jonas Petraitis",
    }).ok === true,
    "freelancer + person accepted"
  );

  const freelancerAgency = matchesTranslatorCandidateTypeFilter({
    filter: "freelancer",
    entityType: "agency",
    displayName: "Acme Translation Agency",
  });
  check(freelancerAgency.ok === false, "freelancer + agency rejected");
  if (!freelancerAgency.ok) {
    check(freelancerAgency.code === CANDIDATE_TYPE_MISMATCH_CODE, "mismatch diagnostic code");
  }

  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "freelancer",
      entityType: "unknown",
      displayName: "Some Profile",
    }).ok === false,
    "freelancer + unknown rejected"
  );

  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "freelancer",
      entityType: "person",
      displayName: "Baltic Software Platform",
    }).ok === false,
    "freelancer + generic product/org name rejected"
  );

  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "agency",
      entityType: "agency",
      displayName: "Vilnius Translation Agency",
    }).ok === true,
    "agency + agency accepted"
  );

  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "agency",
      entityType: "person",
      displayName: "Jonas",
    }).ok === false,
    "agency + person rejected"
  );

  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "agency",
      entityType: "unknown",
      displayName: "Profile",
    }).ok === false,
    "agency + unknown rejected"
  );

  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "any",
      entityType: "person",
      displayName: "Ada",
    }).ok === true,
    "any + person accepted"
  );
  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "any",
      entityType: "agency",
      displayName: "Acme Agency",
    }).ok === true,
    "any + agency accepted"
  );
  check(
    matchesTranslatorCandidateTypeFilter({
      filter: "any",
      entityType: "unknown",
      displayName: "X",
    }).ok === true,
    "any + unknown accepted"
  );

  let found = 0;
  const target = 1;
  const rejected = matchesTranslatorCandidateTypeFilter({
    filter: "freelancer",
    entityType: "agency",
    displayName: "Acme Translation Agency",
  });
  found = nextFoundCandidatesAfterMatch({ foundSoFar: found, accepted: rejected.ok });
  check(found === 0, "rejected candidate does not increment found");
  check(!isTargetReached({ foundCandidates: found, targetCandidates: target }), "reject ≠ target_reached");

  const accepted = matchesTranslatorCandidateTypeFilter({
    filter: "freelancer",
    entityType: "person",
    displayName: "Ada Translator",
  });
  found = nextFoundCandidatesAfterMatch({ foundSoFar: found, accepted: accepted.ok });
  check(found === 1, "accepted person increments found");
  check(isTargetReached({ foundCandidates: found, targetCandidates: target }), "person can reach target");

  check(
    !/lingvanex|html|http/i.test(CANDIDATE_TYPE_MISMATCH_WARNING),
    "mismatch warning has no page/brand text"
  );
  // Brand-only names are not hard-rejected by the name heuristic (entity_type remains primary).
  check(
    looksLikeNonPersonTranslatorName("Lingvanex") === false,
    "name heuristic ignores bare brand (no brand hardcode)"
  );
  check(
    looksLikeNonPersonTranslatorName("Acme Limited") === true,
    "name heuristic catches legal-form cue"
  );
  check(
    looksLikeNonPersonTranslatorName("Foo Machine Translation") === true,
    "name heuristic catches machine translation cue"
  );
}

// --- C2 PDF fetch + text extraction ---
{
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures/translator-search/sample-text.pdf"
  );
  const samplePdf = fs.readFileSync(fixturePath);
  check(bufferLooksLikePdf(samplePdf), "fixture starts with %PDF-");

  const parsed = await extractPdfTextFromBuffer({ bytes: samplePdf });
  check(parsed.ok === true, "sample PDF text extracted");
  if (parsed.ok) {
    check(parsed.pageCount === 2, "sample PDF has 2 pages");
    check(parsed.pages[0]?.text.includes("Inga Jokubauske") === true, "page 1 text kept");
    check(parsed.pages[1]?.text.includes("English Lithuanian") === true, "page 2 text kept");
    check(parsed.text.includes("Inga Jokubauske") && parsed.text.includes("English Lithuanian"), "combined text");

    const page = resolvePdfPageFromEvidence({
      pages: parsed.pages,
      evidence: [{ field: "display_name", quote: "Inga Jokubauske freelance translator" }],
    });
    check(page === 1, "pdf_page from grounded display_name quote");

    const page2 = resolvePdfPageFromEvidence({
      pages: parsed.pages,
      evidence: [{ field: "phone", quote: "+37060000000" }],
    });
    check(page2 === 2, "pdf_page from page-2 quote");

    const unknownPage = resolvePdfPageFromEvidence({
      pages: parsed.pages,
      evidence: [{ field: "display_name", quote: "not present in document at all" }],
    });
    check(unknownPage === null, "pdf_page null when quote not grounded");
  }

  const fakePdf = Buffer.from("%PDF- this is not a real pdf body");
  const fakeParsed = await extractPdfTextFromBuffer({ bytes: fakePdf });
  check(
    fakeParsed.ok === false &&
      (fakeParsed.code === "pdf_parse_failed" ||
        fakeParsed.code === "pdf_invalid" ||
        fakeParsed.code === "pdf_no_text"),
    "bogus PDF body fails safely"
  );

  const noMagic = Buffer.from("<html>not pdf</html>");
  const noMagicParsed = await extractPdfTextFromBuffer({ bytes: noMagic });
  check(noMagicParsed.ok === false && noMagicParsed.code === "pdf_invalid", "non-PDF magic rejected");

  // Empty content stream → pdf_no_text
  {
    const objs: string[] = [];
    let nextId = 1;
    const catalogId = nextId++;
    const pagesId = nextId++;
    const fontId = nextId++;
    const pageId = nextId++;
    const contentId = nextId++;
    objs[catalogId] = `${catalogId} 0 obj<< /Type /Catalog /Pages ${pagesId} 0 R >>endobj\n`;
    objs[pagesId] = `${pagesId} 0 obj<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>endobj\n`;
    objs[fontId] = `${fontId} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`;
    objs[contentId] = `${contentId} 0 obj<< /Length 0 >>stream\nendstream\nendobj\n`;
    objs[pageId] = `${pageId} 0 obj<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>endobj\n`;
    let body = "%PDF-1.4\n";
    const offsets = [0];
    for (let id = 1; id < objs.length; id++) {
      offsets[id] = Buffer.byteLength(body, "latin1");
      body += objs[id]!;
    }
    const xrefStart = Buffer.byteLength(body, "latin1");
    body += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objs.length; id++) {
      body += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
    }
    body += `trailer<< /Size ${objs.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    const emptyParsed = await extractPdfTextFromBuffer({ bytes: Buffer.from(body, "latin1") });
    check(emptyParsed.ok === false && emptyParsed.code === "pdf_no_text", "empty PDF → pdf_no_text");
  }

  const charLimited = await extractPdfTextFromBuffer({
    bytes: samplePdf,
    maxChars: 24,
  });
  check(charLimited.ok === true, "char-limited PDF still ok");
  if (charLimited.ok) {
    check(charLimited.text.length <= 24, "PDF text truncated to maxChars");
  }

  const oversize = await extractPdfTextFromBuffer({
    bytes: samplePdf,
    maxBytes: 10,
  });
  check(oversize.ok === false && oversize.code === "pdf_too_large", "maxBytes rejects PDF");

  const pageLimit = await extractPdfTextFromBuffer({
    bytes: samplePdf,
    pagesUsedSoFar: TRANSLATOR_SEARCH_LIMITS.maxPdfPagesTotal - 1,
  });
  check(pageLimit.ok === false && pageLimit.code === "pdf_page_limit", "job page budget rejects PDF");

  // Fetch: real PDF + correct MIME accepted
  {
    const res = await safeFetchDocumentCore("https://example.com/cv.pdf", {
      allowPdf: true,
      lookup: async () => ["93.184.216.34"],
      pinnedRequest: async () => ({
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: (async function* () {
          yield samplePdf;
        })(),
      }),
    });
    check(res.ok && res.kind === "pdf", "PDF MIME + magic accepted");
    if (res.ok && res.kind === "pdf") {
      check(res.bytes.equals(samplePdf), "PDF bytes preserved");
    }
  }

  // Fake PDF with application/pdf rejected
  {
    const res = await safeFetchDocumentCore("https://example.com/fake.pdf", {
      allowPdf: true,
      lookup: async () => ["93.184.216.34"],
      pinnedRequest: async () => ({
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: (async function* () {
          yield Buffer.from("<html>spoof</html>");
        })(),
      }),
    });
    check(!res.ok && res.code === "pdf_invalid", "MIME pdf without magic rejected");
  }

  // .pdf URL returning HTML → treated as HTML by MIME (not URL)
  {
    const res = await safeFetchDocumentCore("https://example.com/report.pdf", {
      allowPdf: true,
      lookup: async () => ["93.184.216.34"],
      pinnedRequest: async () => ({
        statusCode: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: (async function* () {
          yield Buffer.from("<html><title>Not PDF</title><body>ok</body></html>");
        })(),
      }),
    });
    check(res.ok && res.kind === "html", ".pdf URL + HTML MIME → html kind");
  }

  // Content-Length over maxPdfBytes discarded early
  {
    let destroyed = false;
    const res = await safeFetchDocumentCore("https://example.com/big.pdf", {
      allowPdf: true,
      maxPdfBytes: 100,
      lookup: async () => ["93.184.216.34"],
      pinnedRequest: async () => ({
        statusCode: 200,
        headers: { "content-type": "application/pdf", "content-length": "999999" },
        body: (async function* () {
          yield samplePdf;
        })(),
        destroyBody: () => {
          destroyed = true;
        },
      }),
    });
    check(!res.ok && res.code === "pdf_too_large", "Content-Length over maxPdfBytes");
    check(destroyed, "oversized PDF body destroyed");
  }

  // Redirect to private still blocked for PDF accept path
  {
    let destroyed = false;
    const res = await safeFetchDocumentCore("https://example.com/start.pdf", {
      allowPdf: true,
      timeoutMs: 2000,
      lookup: async () => ["93.184.216.34"],
      pinnedRequest: async ({ url }) => {
        if (url.pathname === "/start.pdf") {
          return {
            statusCode: 302,
            headers: { location: "https://169.254.169.254/latest" },
            body: (async function* () {
              yield samplePdf;
            })(),
            destroyBody: () => {
              destroyed = true;
            },
          };
        }
        throw new Error("should not connect");
      },
    });
    check(
      !res.ok && (res.code === "url_blocked_host" || res.code === "dns_blocked_ip"),
      "PDF path redirect private blocked"
    );
    check(destroyed, "PDF path redirect body destroyed");
  }

  // Hung body timeout on PDF path
  {
    let destroyed = false;
    let rejectPending: ((err: Error) => void) | null = null;
    const started = Date.now();
    const hung = safeFetchDocumentCore("https://example.com/hung.pdf", {
      allowPdf: true,
      timeoutMs: 40,
      lookup: async () => ["93.184.216.34"],
      pinnedRequest: async () => ({
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return new Promise<IteratorResult<Uint8Array>>((_resolve, reject) => {
                  rejectPending = reject;
                });
              },
              return() {
                return Promise.resolve({ done: true, value: undefined });
              },
            };
          },
        },
        destroyBody: () => {
          destroyed = true;
          try {
            rejectPending?.(Object.assign(new Error("aborted"), { name: "AbortError" }));
          } catch {
            // ignore
          }
        },
      }),
    });
    const res = await hung;
    const elapsed = Date.now() - started;
    check(!res.ok && res.code === "fetch_timeout", "PDF hung body → fetch_timeout");
    check(destroyed, "PDF hung body destroyBody called");
    check(elapsed < 1500, "PDF hung body returned quickly");
  }

  // HTML-only API still rejects PDF MIME
  {
    let destroyed = false;
    const res = await safeFetchHtmlCore("https://example.com/a.pdf", {
      lookup: async () => ["93.184.216.34"],
      pinnedRequest: async () => ({
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: (async function* () {
          yield samplePdf;
        })(),
        destroyBody: () => {
          destroyed = true;
        },
      }),
    });
    check(!res.ok && res.code === "mime_not_html", "safeFetchHtml rejects PDF MIME");
    check(destroyed, "HTML-only API discards PDF body");
  }

  // Type filter + dedupe still apply to PDF-originated person
  {
    const typeOk = matchesTranslatorCandidateTypeFilter({
      filter: "freelancer",
      entityType: "person",
      displayName: "Inga Jokubauske",
    });
    check(typeOk.ok === true, "PDF person passes type filter");
    const typeBad = matchesTranslatorCandidateTypeFilter({
      filter: "freelancer",
      entityType: "agency",
      displayName: "Acme Agency",
    });
    check(typeBad.ok === false, "PDF agency rejected by type filter");
    const key = computeDedupeKey({
      email: "test@example.com",
      websiteUrl: null,
      displayName: "Inga Jokubauske",
      country: "Lithuania",
      canonicalSourceUrl: "https://example.com/cv.pdf",
    });
    check(typeof key === "string" && key.length > 8, "PDF candidate dedupe key");
  }

  // PDF parse failure does not imply target_reached / found increment
  {
    let found = 0;
    const rejected = await extractPdfTextFromBuffer({ bytes: Buffer.from("nope") });
    check(rejected.ok === false, "bad PDF rejected");
    found = nextFoundCandidatesAfterMatch({ foundSoFar: found, accepted: false });
    check(found === 0, "PDF skip does not increment found");
    check(!isTargetReached({ foundCandidates: found, targetCandidates: 1 }), "PDF skip ≠ target_reached");
  }

  check(TRANSLATOR_SEARCH_LIMITS.maxPdfFiles === 3, "maxPdfFiles=3");
  check(TRANSLATOR_SEARCH_LIMITS.maxPdfPagesTotal === 30, "maxPdfPagesTotal=30");

  // Destroy path must not break subsequent successful extraction
  const again = await extractPdfTextFromBuffer({ bytes: samplePdf });
  check(again.ok === true, "PDF destroy path allows re-extract");

  // Page-limit rejection still returns safe code (destroy covered in finally)
  const limitedAgain = await extractPdfTextFromBuffer({
    bytes: samplePdf,
    pagesUsedSoFar: TRANSLATOR_SEARCH_LIMITS.maxPdfPagesTotal - 1,
  });
  check(limitedAgain.ok === false && limitedAgain.code === "pdf_page_limit", "page limit after destroy wiring");
}

if (failures.length) {
  console.error("verify-translator-search-core: FAILED");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-translator-search-core: ok");
