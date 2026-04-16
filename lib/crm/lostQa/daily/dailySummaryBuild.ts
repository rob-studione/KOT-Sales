import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LostCaseAnalysisRow, LostCaseRow, LostPrimaryReason } from "@/lib/crm/lostQaDb";
import type {
  DailyAggregate,
  DailyAiInput,
  DailyAiInputCaseExcerpt,
  PriorityCaseRow,
  TopAgentRow,
  TopReasonRow,
} from "@/lib/crm/lostQa/daily/dailySummaryTypes";

type JoinedRow = {
  lost: LostCaseRow;
  analysis: LostCaseAnalysisRow;
};

function ymd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseYmdOrThrow(v: string): string {
  const s = (v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("summaryDate must be YYYY-MM-DD.");
  const dt = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || ymd(dt) !== s) throw new Error("summaryDate must be a valid date.");
  return s;
}

export function iterateYmdRange(dateFrom: string, dateTo: string): string[] {
  const from = parseYmdOrThrow(dateFrom);
  const to = parseYmdOrThrow(dateTo);
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (start.getTime() > end.getTime()) throw new Error("dateFrom must be <= dateTo.");
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    out.push(ymd(new Date(t)));
  }
  return out;
}

async function fetchAnalyzedCasesForScope(admin: SupabaseClient, summaryDate: string, mailboxId: string | null): Promise<JoinedRow[]> {
  // Use UTC day boundaries; DB cast rule is lost_detected_at::date, but in practice
  // the cast depends on DB timezone. We keep a simple server-side range query here.
  const start = `${summaryDate}T00:00:00.000Z`;
  const next = new Date(`${summaryDate}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = `${ymd(next)}T00:00:00.000Z`;

  let q = admin
    .from("lost_cases")
    .select(
      "*, lost_case_analysis!inner(*)"
    )
    .gte("lost_detected_at", start)
    .lt("lost_detected_at", end)
    .eq("lost_case_analysis.prompt_version", 1);

  if (mailboxId) {
    q = q.eq("mailbox_id", mailboxId);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data as Array<LostCaseRow & { lost_case_analysis: LostCaseAnalysisRow[] }> | null) ?? [];
  return rows
    .map((r) => {
      const analysis = r.lost_case_analysis?.[0];
      if (!analysis) return null;
      const lost = { ...r } as any;
      delete lost.lost_case_analysis;
      return { lost: lost as LostCaseRow, analysis } satisfies JoinedRow;
    })
    .filter((x): x is JoinedRow => Boolean(x));
}

function freqTopReasons(rows: JoinedRow[]): TopReasonRow[] {
  const m = new Map<LostPrimaryReason, number>();
  for (const r of rows) {
    m.set(r.analysis.primary_reason, (m.get(r.analysis.primary_reason) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([reason, count]) => ({ reason, count }));
}

function freqTopAgents(rows: JoinedRow[]): TopAgentRow[] {
  const m = new Map<string, { name: string | null; count: number }>();
  for (const r of rows) {
    const email = r.lost.assigned_agent_email?.trim();
    if (!email) continue;
    const prev = m.get(email) ?? { name: r.lost.assigned_agent_name ?? null, count: 0 };
    prev.count += 1;
    if (!prev.name && r.lost.assigned_agent_name) prev.name = r.lost.assigned_agent_name;
    m.set(email, prev);
  }
  return [...m.entries()]
    .map(([assigned_agent_email, v]) => ({
      assigned_agent_email,
      assigned_agent_name: v.name,
      lost_count: v.count,
    }))
    .sort((a, b) => b.lost_count - a.lost_count || a.assigned_agent_email.localeCompare(b.assigned_agent_email));
}

function isNonEmptyJsonArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function buildPriorityCases(rows: JoinedRow[]): PriorityCaseRow[] {
  const priority = rows.filter((r) => {
    const a = r.analysis;
    const agentMistakesNonEmpty = isNonEmptyJsonArray(a.agent_mistakes);
    return (
      a.response_quality_issue === true ||
      a.response_speed_issue === true ||
      a.primary_reason === "internal_mistake" ||
      (a.confidence >= 0.75 && a.competitor_mentioned === true) ||
      (a.confidence >= 0.75 && a.price_issue === true) ||
      agentMistakesNonEmpty
    );
  });

  return priority
    .map((r) => ({
      lost_case_id: r.lost.id,
      subject: r.lost.subject,
      client_email: r.lost.client_email,
      assigned_agent_email: r.lost.assigned_agent_email,
      primary_reason: r.analysis.primary_reason,
      confidence: r.analysis.confidence,
      price_issue: r.analysis.price_issue,
      response_speed_issue: r.analysis.response_speed_issue,
      response_quality_issue: r.analysis.response_quality_issue,
      competitor_mentioned: r.analysis.competitor_mentioned,
      lost_detected_at: r.lost.lost_detected_at,
    }))
    .sort((a, b) => {
      const rq = Number(b.response_quality_issue) - Number(a.response_quality_issue);
      if (rq) return rq;
      const rs = Number(b.response_speed_issue) - Number(a.response_speed_issue);
      if (rs) return rs;
      const conf = b.confidence - a.confidence;
      if (conf) return conf;
      const t = a.lost_detected_at.localeCompare(b.lost_detected_at);
      if (t) return t;
      return a.lost_case_id.localeCompare(b.lost_case_id);
    })
    .slice(0, 10)
    .map(({ lost_detected_at: _ignore, ...rest }) => rest);
}

export async function buildDailyAggregate(
  admin: SupabaseClient,
  summaryDate: string,
  mailboxId: string | null
): Promise<{ aggregate: DailyAggregate; aiInput: DailyAiInput; rows: JoinedRow[] }> {
  const rows = await fetchAnalyzedCasesForScope(admin, summaryDate, mailboxId);

  const total = rows.length;
  const aggregate: DailyAggregate = {
    summary_date: summaryDate,
    mailbox_id: mailboxId,
    total_lost_count: total,
    price_issue_count: rows.filter((r) => r.analysis.price_issue).length,
    response_speed_issue_count: rows.filter((r) => r.analysis.response_speed_issue).length,
    response_quality_issue_count: rows.filter((r) => r.analysis.response_quality_issue).length,
    followup_issue_count: rows.filter((r) => r.analysis.followup_issue).length,
    qualification_issue_count: rows.filter((r) => r.analysis.qualification_issue).length,
    competitor_count: rows.filter((r) => r.analysis.competitor_mentioned).length,
    scope_mismatch_count: rows.filter((r) => r.analysis.scope_mismatch).length,
    top_reasons: freqTopReasons(rows),
    top_agents: freqTopAgents(rows),
    priority_cases: buildPriorityCases(rows),
  };

  const excerpts: DailyAiInputCaseExcerpt[] = rows
    .sort((a, b) => a.lost.lost_detected_at.localeCompare(b.lost.lost_detected_at) || a.lost.id.localeCompare(b.lost.id))
    .slice(0, 50) // cap input size deterministically
    .map((r) => ({
      lost_case_id: r.lost.id,
      lost_detected_at: r.lost.lost_detected_at,
      primary_reason: r.analysis.primary_reason,
      secondary_reason: r.analysis.secondary_reason,
      confidence: r.analysis.confidence,
      agent_mistakes: r.analysis.agent_mistakes,
      improvement_actions: r.analysis.improvement_actions,
      thread_summary: r.analysis.thread_summary,
      manager_feedback_draft: r.analysis.manager_feedback_draft,
    }));

  const aiInput: DailyAiInput = {
    scope: { summary_date: summaryDate, mailbox_id: mailboxId },
    aggregates: {
      total_lost_count: aggregate.total_lost_count,
      price_issue_count: aggregate.price_issue_count,
      response_speed_issue_count: aggregate.response_speed_issue_count,
      response_quality_issue_count: aggregate.response_quality_issue_count,
      followup_issue_count: aggregate.followup_issue_count,
      qualification_issue_count: aggregate.qualification_issue_count,
      competitor_count: aggregate.competitor_count,
      scope_mismatch_count: aggregate.scope_mismatch_count,
      top_reasons: aggregate.top_reasons,
      top_agents: aggregate.top_agents,
      priority_cases: aggregate.priority_cases,
    },
    top_reasons: aggregate.top_reasons,
    top_agents: aggregate.top_agents,
    priority_cases: aggregate.priority_cases,
    case_excerpts: excerpts,
  };

  return { aggregate, aiInput, rows };
}

export function dailyDeterministicFieldsEqual(a: any, b: DailyAggregate): boolean {
  if (!a) return false;
  const keys = [
    "total_lost_count",
    "price_issue_count",
    "response_speed_issue_count",
    "response_quality_issue_count",
    "followup_issue_count",
    "qualification_issue_count",
    "competitor_count",
    "scope_mismatch_count",
  ] as const;
  for (const k of keys) {
    if (Number(a[k]) !== Number((b as any)[k])) return false;
  }
  return (
    JSON.stringify(a.top_reasons ?? []) === JSON.stringify(b.top_reasons) &&
    JSON.stringify(a.top_agents ?? []) === JSON.stringify(b.top_agents) &&
    JSON.stringify(a.priority_cases ?? []) === JSON.stringify(b.priority_cases)
  );
}

