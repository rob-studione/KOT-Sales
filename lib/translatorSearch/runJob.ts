import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isOpenAiGloballyDisabledByEnv, openAiGloballyDisabledMessage } from "@/lib/openai/callGate";
import { TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING, isTranslatorSearchBudgetEnforced } from "@/lib/translatorSearch/costAssessment";
import { TranslatorSearchConfigError, getTranslatorSearchModel } from "@/lib/translatorSearch/model";
import {
  canAffordNextCall,
  requireTranslatorSearchPricing,
} from "@/lib/translatorSearch/pricing";
import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import {
  computeDedupeKey,
  hashRequestParams,
} from "@/lib/translatorSearch/dedupe";
import { DbUpdateError } from "@/lib/translatorSearch/dbUpdates";
import { discoverTranslatorSources } from "@/lib/translatorSearch/discoverSources";
import { htmlToText } from "@/lib/translatorSearch/htmlToText";
import {
  canStartTimedAction,
  createJobDeadline,
} from "@/lib/translatorSearch/jobDeadline";
import { assertJobTransition, buildTerminalJobPatch } from "@/lib/translatorSearch/jobStatus";
import {
  failJobOrThrow,
  insertOrReuseCandidateByDedupe,
  listActiveJobsForActor,
  updateJobOrThrow,
} from "@/lib/translatorSearch/jobPersistence";
import { extractTranslatorCandidateFromText } from "@/lib/translatorSearch/openaiExtractCandidate";
import { runTranslatorWebSearch } from "@/lib/translatorSearch/openaiWebSearch";
import { prefilterContacts } from "@/lib/translatorSearch/prefilterContacts";
import { safeFetchHtml } from "@/lib/translatorSearch/safeFetch";
import { resolveTranslatorStopReason } from "@/lib/translatorSearch/stopReason";
import {
  CANDIDATE_TYPE_MISMATCH_WARNING,
  isTargetReached,
  matchesTranslatorCandidateTypeFilter,
  nextFoundCandidatesAfterMatch,
} from "@/lib/translatorSearch/candidateTypeMatch";
import type {
  TranslatorCandidateEvidence,
  TranslatorSearchRequestParams,
} from "@/lib/translatorSearch/types";

export type RunJobResult = {
  jobId: string;
  status: "completed" | "failed" | "running" | "pending";
  reusedExistingJob?: boolean;
  candidatesCreated: number;
  candidatesReused: number;
  sourcesSaved: number;
  warning: string | null;
  error_code: string | null;
  error_message: string | null;
  stop_reason: string | null;
  cost_eur_estimated: number;
  budget_enforced: boolean;
};

function evidenceToJson(
  items: Array<{ field: string; quote: string }>
): TranslatorCandidateEvidence {
  const out: TranslatorCandidateEvidence = {};
  for (const e of items) {
    if (!out[e.field]) out[e.field] = { field: e.field, quote: e.quote };
  }
  return out;
}

function pushUniqueWarning(warnings: string[], msg: string): void {
  if (!warnings.includes(msg)) warnings.push(msg);
}

async function completeJob(params: {
  admin: SupabaseClient;
  jobId: string;
  stopReason: string;
  warning: string | null;
  searchCalls: number;
  fetchCount: number;
  openaiCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEur: number;
  candidatesCreated: number;
  candidatesReused: number;
  sourcesSaved: number;
  budgetEnforced: boolean;
}): Promise<RunJobResult> {
  assertJobTransition("running", "completed");
  const cost = Number(params.costEur.toFixed(6));
  await updateJobOrThrow(
    params.admin,
    params.jobId,
    {
      ...buildTerminalJobPatch("completed", {
        stop_reason: params.stopReason,
        warning: params.warning,
      }),
      search_calls: params.searchCalls,
      fetch_url_count: params.fetchCount,
      openai_calls: params.openaiCalls,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      total_tokens: params.totalTokens,
      cost_eur_estimated: cost,
    },
    "db_update_terminal"
  );
  return {
    jobId: params.jobId,
    status: "completed",
    candidatesCreated: params.candidatesCreated,
    candidatesReused: params.candidatesReused,
    sourcesSaved: params.sourcesSaved,
    warning: params.warning,
    error_code: null,
    error_message: null,
    stop_reason: params.stopReason,
    cost_eur_estimated: cost,
    budget_enforced: params.budgetEnforced,
  };
}

export async function runTranslatorSearchJob(params: {
  admin: SupabaseClient;
  actorId: string;
  title: string;
  requestParams: TranslatorSearchRequestParams;
}): Promise<RunJobResult> {
  const { admin, actorId, title, requestParams } = params;
  const paramsHash = hashRequestParams(requestParams);

  getTranslatorSearchModel();
  const pricing = requireTranslatorSearchPricing();
  let costUnknown = false;
  let budgetEnforced = isTranslatorSearchBudgetEnforced(costUnknown);
  const deadline = createJobDeadline();

  const windowIso = new Date(
    Date.now() - TRANSLATOR_SEARCH_LIMITS.activeJobDedupeWindowMinutes * 60_000
  ).toISOString();
  const activeJobs = await listActiveJobsForActor(admin, actorId, windowIso);

  for (const row of activeJobs) {
    const existingHash = hashRequestParams(row.request_params);
    if (existingHash === paramsHash) {
      return {
        jobId: String(row.id),
        status: row.status as RunJobResult["status"],
        reusedExistingJob: true,
        candidatesCreated: 0,
        candidatesReused: 0,
        sourcesSaved: 0,
        warning: "Pakartotas paleidimas — grąžintas esamas aktyvus job.",
        error_code: null,
        error_message: null,
        stop_reason: null,
        cost_eur_estimated: 0,
        budget_enforced: true,
      };
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from("translator_search_jobs")
    .insert({
      requested_by: actorId,
      title,
      request_params: requestParams,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    throw new DbUpdateError("job_insert_failed", "job_insert_failed");
  }

  const jobId = String(inserted.id);
  let enteredRunning = false;

  assertJobTransition("pending", "running");
  await updateJobOrThrow(
    admin,
    jobId,
    { status: "running", started_at: new Date().toISOString() },
    "db_update_running"
  );
  enteredRunning = true;

  if (isOpenAiGloballyDisabledByEnv()) {
    await failJobOrThrow(admin, jobId, "openai_disabled");
    return {
      jobId,
      status: "failed",
      candidatesCreated: 0,
      candidatesReused: 0,
      sourcesSaved: 0,
      warning: null,
      error_code: "openai_disabled",
      error_message: openAiGloballyDisabledMessage(),
      stop_reason: null,
      cost_eur_estimated: 0,
      budget_enforced: true,
    };
  }

  let searchCalls = 0;
  let fetchCount = 0;
  let openaiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costEur = 0;
  let candidatesCreated = 0;
  let candidatesReused = 0;
  let sourcesSaved = 0;
  const warnings: string[] = [];
  const domainCounts = new Map<string, number>();
  let timeLimit = false;
  let costLimit = false;
  let sourceLimit = false;
  let targetReached = false;

  try {
    const discovery = await discoverTranslatorSources({
      request: requestParams,
      pricing,
      spentEur: 0,
      deadline,
      runWebSearch: async (query, ctx) => {
        const r = await runTranslatorWebSearch({ query, timeoutMs: ctx.timeoutMs });
        if (!r.ok) {
          return {
            ok: false,
            code: r.code,
            searchActions: r.searchActions,
            usage: r.usage,
            costFullyKnown: r.costFullyKnown,
            knownCostEur: r.knownCostEur,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            total_tokens: r.total_tokens,
          };
        }
        return {
          ok: true,
          sourceUrls: r.sourceUrls,
          searchActions: r.searchActions,
          usage: r.usage,
          costFullyKnown: r.costFullyKnown,
          knownCostEur: r.knownCostEur,
          input_tokens: r.input_tokens,
          output_tokens: r.output_tokens,
          total_tokens: r.total_tokens,
          assistantTextIgnored: r.assistantTextIgnored,
        };
      },
    });

    searchCalls += discovery.searchCalls;
    openaiCalls += discovery.openaiCalls;
    inputTokens += discovery.inputTokens;
    outputTokens += discovery.outputTokens;
    totalTokens += discovery.totalTokens;
    costEur += discovery.costEur;
    warnings.push(...discovery.warnings);
    timeLimit = timeLimit || discovery.timeLimit;
    costLimit = costLimit || discovery.costLimit;
    sourceLimit = sourceLimit || discovery.sourceLimit;
    if (discovery.costUnknown) {
      costUnknown = true;
      budgetEnforced = isTranslatorSearchBudgetEnforced(costUnknown);
      costLimit = true;
      pushUniqueWarning(warnings, TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING);
    }

    const planned = discovery.sources;
    let foundCandidates = 0;

    if (planned.length === 0 || costUnknown) {
      // No sources, or unknown cost forbids further OpenAI (extraction) calls.
      if (costUnknown && planned.length > 0) {
        pushUniqueWarning(
          warnings,
          "Po nežinomos kainos OpenAI kvietimo extraction nestartuojamas; daliniai rezultatai išsaugoti."
        );
      }
      const stopReason = resolveTranslatorStopReason({
        timeLimit,
        costLimit,
        sourceLimit,
      });
      const warning = warnings.length ? warnings.slice(0, 12).join(" · ") : "Nerasta tinkamų šaltinių.";
      return completeJob({
        admin,
        jobId,
        stopReason,
        warning,
        searchCalls,
        fetchCount,
        openaiCalls,
        inputTokens,
        outputTokens,
        totalTokens,
        costEur,
        candidatesCreated: 0,
        candidatesReused: 0,
        sourcesSaved: 0,
        budgetEnforced,
      });
    }

    for (const src of planned) {
      if (costUnknown) break;
      if (foundCandidates >= requestParams.targetCandidates) {
        targetReached = true;
        break;
      }

      const fetchGate = canStartTimedAction({
        deadline,
        preferredTimeoutMs: TRANSLATOR_SEARCH_LIMITS.fetchTimeoutMs,
      });
      if (!fetchGate.ok) {
        warnings.push("Pasiektas vidinis laiko limitas prieš fetch.");
        timeLimit = true;
        break;
      }

      if (fetchCount >= TRANSLATOR_SEARCH_LIMITS.maxFetchUrls) {
        warnings.push("Pasiektas fetch URL limitas.");
        sourceLimit = true;
        break;
      }

      if (
        !canAffordNextCall({
          pricing,
          spentEur: costEur,
          maxBudgetEur: requestParams.maxBudgetEur,
          maxInputChars: TRANSLATOR_SEARCH_LIMITS.maxCharsPerSource,
          maxOutputTokens: TRANSLATOR_SEARCH_LIMITS.maxExtractionOutputTokens,
        })
      ) {
        warnings.push("Pasiektas biudžeto rezervas.");
        costLimit = true;
        break;
      }

      const extractionCallsSoFar = openaiCalls - discovery.openaiCalls;
      if (extractionCallsSoFar >= TRANSLATOR_SEARCH_LIMITS.maxExtractionCalls) {
        warnings.push("Pasiektas extraction call limitas.");
        sourceLimit = true;
        break;
      }

      let host = "";
      try {
        host = new URL(src.canonicalUrl).hostname.toLowerCase();
      } catch {
        warnings.push("Praleistas netinkamas URL.");
        continue;
      }
      const domainN = domainCounts.get(host) ?? 0;
      if (domainN >= TRANSLATOR_SEARCH_LIMITS.maxPagesPerDomain) {
        warnings.push(`Praleistas ${host}: domeno limitas.`);
        continue;
      }

      const fetched = await safeFetchHtml(src.originalUrl, { timeoutMs: fetchGate.timeoutMs });
      fetchCount += 1;
      domainCounts.set(host, domainN + 1);
      if (!fetched.ok) {
        warnings.push(`URL klaida (${fetched.code}).`);
        continue;
      }

      const text = htmlToText(fetched.html);
      const pre = prefilterContacts(text);
      if (!pre.worthSendingToModel) {
        warnings.push(`Praleistas silpnas šaltinis (${pre.reasonIfSkip}).`);
        continue;
      }

      const extractGate = canStartTimedAction({
        deadline,
        preferredTimeoutMs: TRANSLATOR_SEARCH_LIMITS.openaiExtractionTimeoutMs,
      });
      if (!extractGate.ok) {
        warnings.push("Pasiektas vidinis laiko limitas prieš extraction.");
        timeLimit = true;
        break;
      }

      const boundedChars = Math.min(text.length, TRANSLATOR_SEARCH_LIMITS.maxCharsPerSource);
      if (
        !canAffordNextCall({
          pricing,
          spentEur: costEur,
          maxBudgetEur: requestParams.maxBudgetEur,
          maxInputChars: boundedChars,
          maxOutputTokens: TRANSLATOR_SEARCH_LIMITS.maxExtractionOutputTokens,
        })
      ) {
        warnings.push("Pasiektas biudžeto rezervas.");
        costLimit = true;
        break;
      }

      if (costUnknown) break;

      openaiCalls += 1;
      let extracted;
      try {
        extracted = await extractTranslatorCandidateFromText({
          pageText: text.slice(0, TRANSLATOR_SEARCH_LIMITS.maxCharsPerSource),
          pageUrl: fetched.finalUrl,
          pageTitle: fetched.titleHint,
          search: requestParams,
          timeoutMs: extractGate.timeoutMs,
        });
      } catch (e) {
        if (e instanceof TranslatorSearchConfigError) throw e;
        costUnknown = true;
        budgetEnforced = isTranslatorSearchBudgetEnforced(costUnknown);
        costLimit = true;
        pushUniqueWarning(warnings, TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING);
        warnings.push("Extraction nepavyko be patikimos kainos.");
        break;
      }

      inputTokens += extracted.input_tokens;
      outputTokens += extracted.output_tokens;
      totalTokens += extracted.total_tokens;
      if (Number.isFinite(extracted.knownCostEur) && extracted.knownCostEur > 0) {
        costEur += extracted.knownCostEur;
      }

      if (!extracted.costFullyKnown) {
        costUnknown = true;
        budgetEnforced = isTranslatorSearchBudgetEnforced(costUnknown);
        costLimit = true;
        pushUniqueWarning(warnings, TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING);
      }

      if (!extracted.ok) {
        warnings.push("Extraction nepavyko.");
        if (costUnknown) break;
        continue;
      }

      if (!extracted.parsed.found || !extracted.parsed.display_name) {
        warnings.push("Kandidatas nerastas šaltinyje.");
        if (costUnknown) break;
        continue;
      }

      const typeMatch = matchesTranslatorCandidateTypeFilter({
        filter: requestParams.candidateType,
        entityType: extracted.parsed.entity_type,
        displayName: extracted.parsed.display_name,
      });
      if (!typeMatch.ok) {
        pushUniqueWarning(warnings, CANDIDATE_TYPE_MISMATCH_WARNING);
        // Do not persist; do not advance foundCandidates / target_reached.
        if (costUnknown) break;
        continue;
      }

      const dedupeKey = computeDedupeKey({
        email: extracted.parsed.email,
        websiteUrl: extracted.parsed.website_url,
        displayName: extracted.parsed.display_name,
        country: extracted.parsed.country ?? requestParams.country,
        canonicalSourceUrl: fetched.canonicalUrl,
      });

      let persist;
      try {
        persist = await insertOrReuseCandidateByDedupe(admin, dedupeKey, {
          display_name: extracted.parsed.display_name,
          entity_type: extracted.parsed.entity_type,
          email: extracted.parsed.email,
          phone: extracted.parsed.phone,
          country: extracted.parsed.country ?? requestParams.country,
          city: extracted.parsed.city ?? requestParams.city,
          language_pairs: extracted.parsed.language_pairs,
          specializations: extracted.parsed.specializations,
          sworn_status: extracted.parsed.sworn_status,
          website_url: extracted.parsed.website_url,
          match_summary: extracted.parsed.match_summary,
          dedupe_key: dedupeKey,
        });
      } catch (e) {
        if (e instanceof DbUpdateError && e.code === "db_read") throw e;
        warnings.push("Kandidato įrašymas nepavyko.");
        if (costUnknown) break;
        continue;
      }

      if (persist.created) candidatesCreated += 1;
      if (persist.reused) candidatesReused += 1;
      foundCandidates = nextFoundCandidatesAfterMatch({
        foundSoFar: foundCandidates,
        accepted: true,
      });

      if (isTargetReached({ foundCandidates, targetCandidates: requestParams.targetCandidates })) {
        targetReached = true;
      }

      const candidateId = persist.candidateId;
      const existing = persist.existing;
      const merge = persist.merge;

      if (merge.mayEnrichProfile && candidateId && existing && !merge.preserveReview) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (!existing.email && extracted.parsed.email) patch.email = extracted.parsed.email;
        if (!existing.phone && extracted.parsed.phone) patch.phone = extracted.parsed.phone;
        if (!existing.website_url && extracted.parsed.website_url) {
          patch.website_url = extracted.parsed.website_url;
        }
        if (Object.keys(patch).length > 1) {
          const { error: enrichErr } = await admin
            .from("translator_candidates")
            .update(patch)
            .eq("id", candidateId);
          if (enrichErr) warnings.push("Kandidato papildymas nepavyko.");
        }
      }

      const evidence = evidenceToJson(extracted.parsed.evidence);
      const { error: sErr } = await admin.from("translator_candidate_sources").upsert(
        {
          candidate_id: candidateId,
          job_id: jobId,
          source_type: src.sourceType,
          original_url: src.originalUrl,
          canonical_url: fetched.canonicalUrl,
          title: fetched.titleHint,
          snippet: text.slice(0, 400),
          evidence,
          pdf_page: null,
          retrieved_at: new Date().toISOString(),
        },
        { onConflict: "job_id,candidate_id,canonical_url", ignoreDuplicates: true }
      );
      if (sErr) warnings.push("Šaltinio įrašymas nepavyko.");
      else sourcesSaved += 1;

      // After unknown-cost extraction, keep this candidate/source but stop further OpenAI.
      if (costUnknown) break;
      if (targetReached) break;
    }

    if (isTargetReached({ foundCandidates, targetCandidates: requestParams.targetCandidates })) {
      targetReached = true;
    }

    const stopReason = resolveTranslatorStopReason({
      targetReached,
      timeLimit,
      costLimit,
      sourceLimit,
    });
    const warning = warnings.length ? warnings.slice(0, 12).join(" · ") : null;
    return completeJob({
      admin,
      jobId,
      stopReason,
      warning,
      searchCalls,
      fetchCount,
      openaiCalls,
      inputTokens,
      outputTokens,
      totalTokens,
      costEur,
      candidatesCreated,
      candidatesReused,
      sourcesSaved,
      budgetEnforced,
    });
  } catch (e) {
    const code =
      e instanceof TranslatorSearchConfigError || e instanceof DbUpdateError
        ? e.code
        : "job_exception";

    if (!enteredRunning) throw e;

    // Terminal update failure must not be reported as failed/completed
    if (code === "db_update_terminal") throw e;

    try {
      await failJobOrThrow(admin, jobId, code === "db_update_running" ? "job_exception" : code, {
        search_calls: searchCalls,
        fetch_url_count: fetchCount,
        openai_calls: openaiCalls,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost_eur_estimated: Number(costEur.toFixed(6)),
        warning: warnings.length ? warnings.slice(0, 8).join(" · ") : null,
      });
    } catch {
      throw e;
    }

    return {
      jobId,
      status: "failed",
      candidatesCreated,
      candidatesReused,
      sourcesSaved,
      warning: warnings.length ? warnings.slice(0, 8).join(" · ") : null,
      error_code:
        code === "model_not_configured" ||
        code === "pricing_not_configured" ||
        code === "openai_disabled"
          ? code
          : "job_exception",
      error_message: null,
      stop_reason: null,
      cost_eur_estimated: Number(costEur.toFixed(6)),
      budget_enforced: budgetEnforced,
    };
  }
}
