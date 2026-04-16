import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { iterateYmdRange } from "@/lib/crm/lostQa/daily/dailySummaryBuild";
import { generateDailySummary } from "@/lib/crm/lostQa/daily/runDailySummary";

export type GenerateMissingDailySummariesParams = {
  dateFrom: string;
  dateTo: string;
  mailboxId: string | null;
  force?: boolean;
};

export type GenerateMissingDailySummariesResult = {
  attempted: number;
  created_or_updated: number;
  skipped: number;
  failed: number;
};

export async function generateMissingDailySummaries(
  admin: SupabaseClient,
  params: GenerateMissingDailySummariesParams
): Promise<GenerateMissingDailySummariesResult> {
  const dates = iterateYmdRange(params.dateFrom, params.dateTo);
  const mailboxId = params.mailboxId?.trim() ? params.mailboxId.trim() : null;
  const force = Boolean(params.force);

  const out: GenerateMissingDailySummariesResult = {
    attempted: 0,
    created_or_updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const d of dates) {
    out.attempted += 1;
    const r = await generateDailySummary(admin, { summaryDate: d, mailboxId, force });
    if (!r.ok) {
      out.failed += 1;
      continue;
    }
    if (r.outcome === "skipped") out.skipped += 1;
    else out.created_or_updated += 1;
  }

  return out;
}

