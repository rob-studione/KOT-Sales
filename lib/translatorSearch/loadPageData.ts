import "server-only";

import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { logInternalError } from "@/lib/translatorSearch/apiErrors";
import type {
  TranslatorCandidateRow,
  TranslatorCandidateSourceRow,
  TranslatorSearchJobRow,
} from "@/lib/translatorSearch/types";

export type TranslatorSearchPageData = {
  jobs: TranslatorSearchJobRow[];
  candidates: Array<TranslatorCandidateRow & { sources: TranslatorCandidateSourceRow[] }>;
  loadError: string | null;
  schemaMissing: boolean;
};

const SAFE_LOAD_ERROR =
  "Nepavyko įkelti vertėjų paieškos duomenų. Bandykite dar kartą.";

const SCHEMA_MISSING_ERROR =
  "Lentelės dar nepritaikytos šioje DB (migracija 0137). Duomenų skaitymas laukia migracijos.";

function isMissingRelationError(message: string): boolean {
  return /relation .* does not exist|could not find the table|schema cache/i.test(message);
}

function toLoadFailure(
  scope: string,
  err: { message?: string } | unknown
): TranslatorSearchPageData {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: string }).message ?? "")
      : err instanceof Error
        ? err.message
        : String(err ?? "");
  logInternalError(`translator-search loadPageData:${scope}`, message || err);
  const schemaMissing = isMissingRelationError(message);
  return {
    jobs: [],
    candidates: [],
    loadError: schemaMissing ? SCHEMA_MISSING_ERROR : SAFE_LOAD_ERROR,
    schemaMissing,
  };
}

export async function loadTranslatorSearchPageData(): Promise<TranslatorSearchPageData> {
  try {
    const supabase = await createSupabaseSsrReadOnlyClient();

    const { data: jobs, error: jobsErr } = await supabase
      .from("translator_search_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (jobsErr) {
      const failure = toLoadFailure("jobs", jobsErr);
      return failure;
    }

    const { data: candidates, error: candErr } = await supabase
      .from("translator_candidates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (candErr) {
      return {
        ...toLoadFailure("candidates", candErr),
        jobs: (jobs ?? []) as TranslatorSearchJobRow[],
      };
    }

    const candidateIds = (candidates ?? []).map((c) => String((c as { id: string }).id));
    let sources: TranslatorCandidateSourceRow[] = [];
    if (candidateIds.length) {
      const { data: srcRows, error: srcErr } = await supabase
        .from("translator_candidate_sources")
        .select("*")
        .in("candidate_id", candidateIds)
        .order("retrieved_at", { ascending: false });
      if (srcErr) {
        return {
          ...toLoadFailure("sources", srcErr),
          jobs: (jobs ?? []) as TranslatorSearchJobRow[],
        };
      }
      sources = (srcRows ?? []) as TranslatorCandidateSourceRow[];
    }

    const byCandidate = new Map<string, TranslatorCandidateSourceRow[]>();
    for (const s of sources) {
      const list = byCandidate.get(s.candidate_id) ?? [];
      list.push(s);
      byCandidate.set(s.candidate_id, list);
    }

    const enriched = ((candidates ?? []) as TranslatorCandidateRow[]).map((c) => ({
      ...c,
      language_pairs: Array.isArray(c.language_pairs) ? c.language_pairs : [],
      specializations: Array.isArray(c.specializations) ? c.specializations : [],
      sources: byCandidate.get(c.id) ?? [],
    }));

    return {
      jobs: (jobs ?? []) as TranslatorSearchJobRow[],
      candidates: enriched,
      loadError: null,
      schemaMissing: false,
    };
  } catch (e) {
    return toLoadFailure("exception", e);
  }
}
