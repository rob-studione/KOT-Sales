import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildDayChunks,
  inclusiveOverallRange,
} from "@/lib/invoice123/reconciliation-chunks";
import { runReconciliationChunkPages } from "@/lib/invoice123/reconciliation-fetch-step";

const BOOTSTRAP_CHECKPOINT_ID = "default";
const CHUNK_SIZE_DAYS = 5;

function assertCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const headerSecret = request.headers.get("x-cron-secret");
  const token = bearer ?? headerSecret;
  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  overall_range_start: string;
  overall_range_end: string;
  current_chunk_start: string;
  current_chunk_end: string;
  next_page_url: string | null;
  chunk_index: number;
  total_chunks: number;
  lease_until: string | null;
  locked_by: string | null;
  last_error: string | null;
  last_run_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function isoDateOnly(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return v.slice(0, 10);
}

async function initReconciliationJob(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  jobType: "daily" | "monthly" | "manual",
  lookbackDays?: number
): Promise<
  | { outcome: "created"; jobId: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "error"; message: string }
> {
  const lookback =
    jobType === "monthly" ? 90 : jobType === "daily" ? 30 : Math.min(180, Math.max(1, lookbackDays ?? 30));
  const { start, end } = inclusiveOverallRange(lookback);
  const chunks = buildDayChunks(start, end, CHUNK_SIZE_DAYS);
  if (chunks.length === 0) {
    return { outcome: "error", message: "no_chunks" };
  }
  const first = chunks[0];
  const { data, error } = await supabase
    .from("invoice_reconciliation_jobs")
    .insert({
      job_type: jobType,
      status: "pending",
      overall_range_start: start,
      overall_range_end: end,
      current_chunk_start: first.start,
      current_chunk_end: first.end,
      next_page_url: null,
      chunk_index: 0,
      total_chunks: chunks.length,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { outcome: "skipped", reason: "active_job_exists" };
    }
    return { outcome: "error", message: error.message };
  }
  if (!data?.id) {
    return { outcome: "skipped", reason: "insert_no_row" };
  }
  return { outcome: "created", jobId: data.id as string };
}

export async function POST(request: Request) {
  const unauthorized = assertCronAuth(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  let action = "run";
  let initJobType: "daily" | "monthly" | "manual" | null = null;
  let manualLookback: number | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const b = JSON.parse(text) as {
        action?: string;
        jobType?: string;
        lookbackDays?: number;
      };
      if (b.action === "init" || b.action === "run") action = b.action;
      if (b.jobType === "daily" || b.jobType === "monthly" || b.jobType === "manual") initJobType = b.jobType;
      manualLookback = b.lookbackDays;
    }
  } catch {
    action = "run";
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Supabase: ${message}`, tookMs: Date.now() - startedAt }, { status: 500 });
  }

  if (action === "init") {
    if (!initJobType) {
      return NextResponse.json({ error: "init_requires_jobType" }, { status: 400 });
    }
    const r = await initReconciliationJob(supabase, initJobType, manualLookback);
    if (r.outcome === "error") {
      return NextResponse.json(
        { action: "init", ok: false, error: r.message, tookMs: Date.now() - startedAt },
        { status: 500 }
      );
    }
    if (r.outcome === "skipped") {
      return NextResponse.json({
        action: "init",
        ok: false,
        skipped: true,
        reason: r.reason,
        tookMs: Date.now() - startedAt,
      });
    }
    return NextResponse.json({
      action: "init",
      ok: true,
      jobId: r.jobId,
      tookMs: Date.now() - startedAt,
    });
  }

  const workerId = `recon-${Date.now()}-${globalThis.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_reconciliation_job", {
    p_worker_id: workerId,
  });

  if (claimErr) {
    console.log("[reconciliation-step] claim error", claimErr.message);
    return NextResponse.json(
      { action: "run", ok: false, error: claimErr.message, tookMs: Date.now() - startedAt },
      { status: 500 }
    );
  }

  const job = (claimedRows?.[0] ?? null) as JobRow | null;
  if (!job) {
    return NextResponse.json({
      action: "run",
      skipped: true,
      reason: "no_claimable_job",
      tookMs: Date.now() - startedAt,
    });
  }

  const { data: bootstrapCp, error: bootErr } = await supabase
    .from("invoice_bootstrap_checkpoint")
    .select("finished")
    .eq("id", BOOTSTRAP_CHECKPOINT_ID)
    .maybeSingle();

  if (bootErr || !bootstrapCp?.finished) {
    await supabase
      .from("invoice_reconciliation_jobs")
      .update({
        lease_until: null,
        locked_by: null,
        last_error: bootErr?.message ?? "bootstrap_not_finished",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return NextResponse.json(
      {
        action: "run",
        ok: false,
        jobId: job.id,
        jobType: job.job_type,
        error: bootErr?.message ?? "bootstrap_not_finished",
        tookMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }

  const apiKey = process.env.SASKAITA123_API_KEY;
  if (!apiKey) {
    await supabase
      .from("invoice_reconciliation_jobs")
      .update({
        lease_until: null,
        locked_by: null,
        last_error: "Missing SASKAITA123_API_KEY",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return NextResponse.json(
      { action: "run", ok: false, jobId: job.id, error: "Missing SASKAITA123_API_KEY", tookMs: Date.now() - startedAt },
      { status: 500 }
    );
  }

  const maxPages = Math.min(
    200,
    Math.max(1, Number(process.env.RECONCILIATION_MAX_PAGES_PER_STEP) || 40)
  );
  const budgetMs = Math.min(
    120_000,
    Math.max(5_000, Number(process.env.RECONCILIATION_STEP_BUDGET_MS) || 50_000)
  );

  const chunkStart = isoDateOnly(job.current_chunk_start);
  const chunkEnd = isoDateOnly(job.current_chunk_end);
  const overallStart = isoDateOnly(job.overall_range_start);
  const overallEnd = isoDateOnly(job.overall_range_end);

  const fetchResult = await runReconciliationChunkPages({
    supabase,
    apiKey,
    chunkRangeStart: chunkStart,
    chunkRangeEnd: chunkEnd,
    resumeUrl: job.next_page_url,
    maxPages,
    budgetMs,
    startedAtMs: startedAt,
  });

  const chunks = buildDayChunks(overallStart, overallEnd, CHUNK_SIZE_DAYS);
  const nowIso = new Date().toISOString();

  const releaseLease = {
    lease_until: null as string | null,
    locked_by: null as string | null,
    updated_at: nowIso,
  };

  if (fetchResult.stoppedReason === "upstream_error") {
    await supabase
      .from("invoice_reconciliation_jobs")
      .update({
        ...releaseLease,
        last_error: fetchResult.upstreamError ?? "upstream_error",
        next_page_url: fetchResult.nextPageUrl,
      })
      .eq("id", job.id);

    return NextResponse.json({
      action: "run",
      ok: false,
      jobId: job.id,
      jobType: job.job_type,
      status: "running",
      currentChunk: { start: chunkStart, end: chunkEnd },
      chunkIndex: job.chunk_index,
      totalChunks: job.total_chunks,
      nextPageUrlPresent: Boolean(fetchResult.nextPageUrl),
      hasMore: true,
      pagesProcessedThisStep: fetchResult.pagesProcessed,
      upsertedThisStep: fetchResult.upsertedThisStep,
      stoppedReason: fetchResult.stoppedReason,
      tookMs: Date.now() - startedAt,
    });
  }

  if (fetchResult.stoppedReason === "chunk_complete") {
    const nextIdx = job.chunk_index + 1;
    if (nextIdx >= job.total_chunks) {
      await supabase
        .from("invoice_reconciliation_jobs")
        .update({
          ...releaseLease,
          status: "completed",
          completed_at: nowIso,
          next_page_url: null,
          last_error: null,
        })
        .eq("id", job.id);

      return NextResponse.json({
        action: "run",
        ok: true,
        jobId: job.id,
        jobType: job.job_type,
        status: "completed",
        currentChunk: { start: chunkStart, end: chunkEnd },
        chunkIndex: job.chunk_index,
        totalChunks: job.total_chunks,
        nextPageUrlPresent: false,
        hasMore: false,
        pagesProcessedThisStep: fetchResult.pagesProcessed,
        upsertedThisStep: fetchResult.upsertedThisStep,
        stoppedReason: fetchResult.stoppedReason,
        tookMs: Date.now() - startedAt,
      });
    }

    const nextChunk = chunks[nextIdx];
    if (!nextChunk) {
      await supabase
        .from("invoice_reconciliation_jobs")
        .update({
          ...releaseLease,
          status: "completed",
          completed_at: nowIso,
          next_page_url: null,
          last_error: null,
        })
        .eq("id", job.id);
      return NextResponse.json({
        action: "run",
        ok: true,
        jobId: job.id,
        jobType: job.job_type,
        status: "completed",
        note: "chunk_index_mismatch_fallback",
        tookMs: Date.now() - startedAt,
      });
    }

    await supabase
      .from("invoice_reconciliation_jobs")
      .update({
        ...releaseLease,
        chunk_index: nextIdx,
        current_chunk_start: nextChunk.start,
        current_chunk_end: nextChunk.end,
        next_page_url: null,
        last_error: null,
      })
      .eq("id", job.id);

    return NextResponse.json({
      action: "run",
      ok: true,
      jobId: job.id,
      jobType: job.job_type,
      status: "running",
      currentChunk: { start: nextChunk.start, end: nextChunk.end },
      chunkIndex: nextIdx,
      totalChunks: job.total_chunks,
      nextPageUrlPresent: false,
      hasMore: true,
      pagesProcessedThisStep: fetchResult.pagesProcessed,
      upsertedThisStep: fetchResult.upsertedThisStep,
      stoppedReason: fetchResult.stoppedReason,
      tookMs: Date.now() - startedAt,
    });
  }

  await supabase
    .from("invoice_reconciliation_jobs")
    .update({
      ...releaseLease,
      next_page_url: fetchResult.nextPageUrl,
      last_error: null,
    })
    .eq("id", job.id);

  return NextResponse.json({
    action: "run",
    ok: true,
    jobId: job.id,
    jobType: job.job_type,
    status: "running",
    currentChunk: { start: chunkStart, end: chunkEnd },
    chunkIndex: job.chunk_index,
    totalChunks: job.total_chunks,
    nextPageUrlPresent: Boolean(fetchResult.nextPageUrl),
    hasMore: true,
    pagesProcessedThisStep: fetchResult.pagesProcessed,
    upsertedThisStep: fetchResult.upsertedThisStep,
    stoppedReason: fetchResult.stoppedReason,
    tookMs: Date.now() - startedAt,
  });
}
