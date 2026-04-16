import Link from "next/link";
import { CrmAnalyticsHeader } from "@/components/crm/CrmAnalyticsHeader";
import { CrmContentContainer } from "@/components/crm/CrmContentContainer";
import { LostQaAnalyticsFilters } from "@/components/crm/LostQaAnalyticsFilters";
import { displayAssignedAgentFromMessages } from "@/lib/crm/lostQa/agentDisplay";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

type TopReasonRow = { reason: string; count: number };
type PriorityCaseRow = {
  lost_case_id: string;
  subject: string | null;
  client_email?: string | null;
  assigned_agent_email: string | null;
  primary_reason: string;
  confidence: number;
  price_issue?: boolean;
  response_speed_issue?: boolean;
  response_quality_issue?: boolean;
  competitor_mentioned?: boolean;
};

type PriorityMessageRow = {
  lost_case_id: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_role: string;
  body_clean: string | null;
  body_plain: string | null;
};

type TopAgentRow = {
  assigned_agent_email: string;
  assigned_agent_name: string | null;
  lost_count: number;
};

type DailySummaryRow = {
  id: string;
  summary_date: string;
  mailbox_id: string | null;
  total_lost_count: number;
  price_issue_count: number;
  response_speed_issue_count: number;
  response_quality_issue_count: number;
  followup_issue_count: number;
  qualification_issue_count: number;
  competitor_count: number;
  scope_mismatch_count: number;
  top_reasons: unknown;
  top_agents: unknown;
  priority_cases: unknown;
  manager_summary: string;
  team_action_points: unknown;
};

type MailboxOption = {
  id: string;
  name: string;
  email_address: string;
};

const REASON_LT: Record<string, string> = {
  price_too_high: "Kaina per didelė",
  slow_response: "Per lėtas atsakas",
  poor_response_quality: "Prastas atsakymo turinys",
  missing_followup: "Trūko follow-up",
  client_not_qualified: "Netinkamas klientas",
  client_went_silent: "Klientas nebeatsakė",
  competitor_selected: "Pasirinko kitą tiekėją",
  scope_mismatch: "Apimties neatitikimas",
  internal_mistake: "Vidinė klaida",
  timeline_not_fit: "Netiko terminas",
  other: "Kita",
};

function reasonLabelLt(code: unknown): string {
  const s = String(code ?? "").trim();
  const mapped = REASON_LT[s];
  if (mapped) return mapped;
  if (s.includes("_")) {
    const pretty = s
      .split("_")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return pretty || s;
  }
  return s;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function normalizeIsoDate(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}

function mergeTopReasons(rows: DailySummaryRow[]): TopReasonRow[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    for (const item of asArray<TopReasonRow>(row.top_reasons)) {
      map.set(item.reason, (map.get(item.reason) ?? 0) + n(item.count));
    }
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function mergeTopAgents(rows: DailySummaryRow[]): TopAgentRow[] {
  const map = new Map<string, TopAgentRow>();
  for (const row of rows) {
    for (const item of asArray<TopAgentRow>(row.top_agents)) {
      const key = item.assigned_agent_email;
      const prev = map.get(key);
      if (prev) {
        prev.lost_count += n(item.lost_count);
      } else {
        map.set(key, {
          assigned_agent_email: item.assigned_agent_email,
          assigned_agent_name: item.assigned_agent_name ?? null,
          lost_count: n(item.lost_count),
        });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.lost_count - a.lost_count || a.assigned_agent_email.localeCompare(b.assigned_agent_email)
  );
}

function mergePriorityCases(rows: DailySummaryRow[]): PriorityCaseRow[] {
  const map = new Map<string, PriorityCaseRow>();
  for (const row of rows) {
    for (const item of asArray<PriorityCaseRow>(row.priority_cases)) {
      if (!map.has(item.lost_case_id)) {
        map.set(item.lost_case_id, item);
      }
    }
  }
  return [...map.values()];
}

function mergeActionPoints(rows: DailySummaryRow[]): string[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    for (const item of asArray<string>(row.team_action_points)) {
      const t = humanizeActionPoint(String(item).trim());
      if (!t) continue;
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([text]) => text);
}

function buildRangeSummary(rows: DailySummaryRow[], from: string, to: string): string {
  if (!rows.length) {
    return `Per laikotarpį nuo ${from} iki ${to} neturėjome Lost QA suvestinių.`;
  }
  const top = mergeTopReasons(rows).slice(0, 3);
  const topText = top.length ? top.map((x) => `${reasonLabelLt(x.reason)} (${x.count})`).join(", ") : "priežasčių nėra";
  const total = rows.reduce((sum, r) => sum + n(r.total_lost_count), 0);
  return `Per laikotarpį nuo ${from} iki ${to} praradome ${total} ${total === 1 ? "klientą" : "klientus"}. Dažniausios priežastys: ${topText}.`;
}

function buildDaySummary(rows: DailySummaryRow[], date: string): string {
  if (!rows.length) {
    return `${date} neturėjome Lost QA suvestinės.`;
  }
  const top = mergeTopReasons(rows).slice(0, 3);
  const topText = top.length ? top.map((x) => `${reasonLabelLt(x.reason)} (${x.count})`).join(", ") : "priežasčių nėra";
  const total = rows.reduce((sum, r) => sum + n(r.total_lost_count), 0);
  return `${date} praradome ${total} ${total === 1 ? "klientą" : "klientus"}. Dažniausios priežastys: ${topText}.`;
}

function humanizeActionPoint(text: string): string {
  let out = text.trim();
  if (!out) return out;

  out = out.replace(/^Jei klientas prašo /i, "Jei klientas prašo ");
  out = out.replace(/^Jei klientas užsimena apie /i, "Jei klientas užsimena apie ");
  out = out.replace(/\bpatikrink\b/gi, "verta pasitikrinti");
  out = out.replace(/\bpatikrinkite\b/gi, "verta pasitikrinti");
  out = out.replace(/\bpateikiant pasiūlymą\b/gi, "prieš pasiūlymą");
  out = out.replace(/\bužfiksuota\b/gi, "turėjome");
  out = out.replace(/\batliekami patikslinimai\b/gi, "tikslinant");
  out = out.replace(/\bpadidintum užsakymo tikimybę\b/gi, "kad klientas lengviau apsispręstų");
  out = out.replace(/\bpadidintumėte užsakymo tikimybę\b/gi, "kad klientas lengviau apsispręstų");

  if (/^Jei klientas užsimena apie papildomas paslaugas/i.test(out) && !out.includes("verta")) {
    out = out.replace(/, /, ", verta ");
  }

  return out;
}

export default async function LostQaDailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const sp = await searchParams;

  const { data: mailboxesData, error: mailboxesErr } = await supabase
    .from("gmail_mailboxes")
    .select("id,name,email_address")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (mailboxesErr) throw mailboxesErr;
  const mailboxOptions = ((mailboxesData ?? []) as MailboxOption[]).map((m) => ({
    id: m.id,
    name: m.name,
    email_address: m.email_address,
  }));

  const mailbox = typeof sp.mailbox === "string" ? sp.mailbox : "all";
  const mode = typeof sp.mode === "string" && sp.mode === "range" ? "range" : "day";
  const today = todayIso();
  const presetRaw = typeof sp.preset === "string" ? sp.preset : undefined;
  const preset =
    presetRaw === "today" || presetRaw === "yesterday" || presetRaw === "last7" || presetRaw === "last30" || presetRaw === "custom"
      ? presetRaw
      : mode === "day"
        ? "today"
        : "last7";

  let date = normalizeIsoDate(typeof sp.date === "string" ? sp.date : undefined, today);
  let from = normalizeIsoDate(typeof sp.from === "string" ? sp.from : undefined, shiftDays(today, -6));
  let to = normalizeIsoDate(typeof sp.to === "string" ? sp.to : undefined, today);

  if (mode === "day") {
    if (preset === "today") date = today;
    if (preset === "yesterday") date = shiftDays(today, -1);
  } else {
    if (preset === "last7") {
      from = shiftDays(today, -6);
      to = today;
    }
    if (preset === "last30") {
      from = shiftDays(today, -29);
      to = today;
    }
    if (from > to) [from, to] = [to, from];
  }

  let effectiveRows: DailySummaryRow[] = [];
  if (mode === "day") {
    let q = supabase.from("lost_daily_summaries").select("*").eq("summary_date", date);
    q = mailbox === "all" ? q.not("mailbox_id", "is", null) : q.eq("mailbox_id", mailbox);
    const { data, error } = await q.order("mailbox_id", { ascending: true });
    if (error) throw error;
    effectiveRows = (data as DailySummaryRow[] | null) ?? [];
  } else {
    let q = supabase
      .from("lost_daily_summaries")
      .select("*")
      .gte("summary_date", from)
      .lte("summary_date", to)
      .order("summary_date", { ascending: true });
    q = mailbox === "all" ? q.not("mailbox_id", "is", null) : q.eq("mailbox_id", mailbox);
    const { data, error } = await q;
    if (error) throw error;
    effectiveRows = (data as DailySummaryRow[] | null) ?? [];
  }

  const selectedLabel =
    mode === "day" ? `Data: ${date}` : `Intervalas: ${from} – ${to}`;

  const topReasons = mergeTopReasons(effectiveRows);
  const topAgents = mergeTopAgents(effectiveRows);
  const actionPoints = mergeActionPoints(effectiveRows);
  const priorityCases = mergePriorityCases(effectiveRows);

  const summaryMetrics = {
    total_lost_count: effectiveRows.reduce((sum, r) => sum + n(r.total_lost_count), 0),
    price_issue_count: effectiveRows.reduce((sum, r) => sum + n(r.price_issue_count), 0),
    competitor_count: effectiveRows.reduce((sum, r) => sum + n(r.competitor_count), 0),
    response_quality_issue_count: effectiveRows.reduce((sum, r) => sum + n(r.response_quality_issue_count), 0),
    manager_summary: mode === "day" ? buildDaySummary(effectiveRows, date) : buildRangeSummary(effectiveRows, from, to),
  };

  const priorityCaseIds = priorityCases.map((c) => c.lost_case_id).filter(Boolean);
  const { data: priorityMessagesData, error: priorityMessagesErr } = priorityCaseIds.length
    ? await supabase
        .from("lost_case_messages")
        .select("lost_case_id,sender_name,sender_email,sender_role,body_clean,body_plain,created_at")
        .in("lost_case_id", priorityCaseIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (priorityMessagesErr) throw priorityMessagesErr;

  const messagesByCase = new Map<string, PriorityMessageRow[]>();
  for (const row of ((priorityMessagesData ?? []) as Array<PriorityMessageRow & { created_at?: string }>)) {
    const arr = messagesByCase.get(row.lost_case_id) ?? [];
    arr.push({
      lost_case_id: row.lost_case_id,
      sender_name: row.sender_name,
      sender_email: row.sender_email,
      sender_role: row.sender_role,
      body_clean: row.body_clean,
      body_plain: row.body_plain,
    });
    messagesByCase.set(row.lost_case_id, arr);
  }

  return (
    <CrmContentContainer className="py-8 space-y-8">
      <CrmAnalyticsHeader
        title="Lost QA – Analitika"
        description={
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-gray-900">{selectedLabel}</span>
          </span>
        }
        tabs={
          <LostQaAnalyticsFilters
            mailboxOptions={mailboxOptions}
            mailbox={mailbox}
            mode={mode}
            preset={preset}
            date={date}
            from={from}
            to={to}
          />
        }
      />

      {!effectiveRows.length ? (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-base font-semibold text-gray-900">Nėra duomenų</h3>
          <p className="mt-2 text-sm text-gray-600">
            {mode === "day"
              ? `Pasirinktai datai (${date}) neradome suvestinės.`
              : `Pasirinktame laikotarpyje nuo ${from} iki ${to} neradome suvestinių.`}
          </p>
        </section>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-600">Prarasti klientai</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summaryMetrics.total_lost_count}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-600">Kainos problema</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summaryMetrics.price_issue_count}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-600">Pasirinko konkurentą</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summaryMetrics.competitor_count}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-600">Atsakymo kokybės problema</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summaryMetrics.response_quality_issue_count}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Top reasons */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">Pagrindinės priežastys</h3>
          {topReasons.length ? (
            <ul className="mt-4 space-y-2">
              {topReasons.map((r) => (
                <li key={`${r.reason}-${r.count}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-800">{reasonLabelLt(r.reason)}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{n(r.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-600">Kol kas nematyti pasikartojančių priežasčių.</p>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">Atsakingi vadybininkai</h3>
          {topAgents.length ? (
            <ul className="mt-4 space-y-2">
              {topAgents.map((r) => (
                <li key={`${r.assigned_agent_email}-${r.lost_count}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-800">{r.assigned_agent_name?.trim() || r.assigned_agent_email}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{n(r.lost_count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-600">Šiam pasirinkimui vadybininkų įrašų nėra.</p>
          )}
        </section>

        {/* Team action points */}
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-base font-semibold text-gray-900">Rekomendacijos komandai</h3>
          {actionPoints.length ? (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-900">
              {actionPoints.slice(0, 3).map((t, idx) => (
                <li key={`${idx}-${t.slice(0, 32)}`}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-700">Šiam laikotarpiui papildomų rekomendacijų nėra.</p>
          )}
        </section>
      </div>

      {/* Manager summary */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-base font-semibold text-gray-900">Santrauka</h3>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
          {summaryMetrics.manager_summary}
        </p>
      </section>

      {/* Priority cases */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-base font-semibold text-gray-900">Prioritetiniai atvejai</h3>
        {priorityCases.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <th className="border-b border-gray-200 pb-2 pr-4">Tema</th>
                  <th className="border-b border-gray-200 pb-2 pr-4">Pagrindinė priežastis</th>
                  <th className="border-b border-gray-200 pb-2">Atsakingas vadybininkas</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-900">
                {priorityCases.map((c) => {
                  const assignedAgentDisplay = displayAssignedAgentFromMessages(
                    messagesByCase.get(c.lost_case_id) ?? [],
                    c.assigned_agent_email
                  );
                  return (
                    <tr key={c.lost_case_id} className="align-top">
                      <td className="border-b border-gray-100 py-3 pr-4">
                        <div className="min-w-[260px] max-w-[520px] truncate" title={c.subject ?? ""}>
                          {c.subject ? (
                            <Link
                              href={`/lost-qa/${c.lost_case_id}`}
                              className="text-gray-900 hover:underline"
                              title={c.subject}
                            >
                              {c.subject}
                            </Link>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-gray-100 py-3 pr-4">
                        <span className="text-xs text-gray-800">{reasonLabelLt(c.primary_reason)}</span>
                      </td>
                      <td className="border-b border-gray-100 py-3">
                        {assignedAgentDisplay.value ?? <span className="text-gray-500">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-600">Šiam pasirinkimui ryškesnių prioritetinių atvejų nematyti.</p>
        )}
      </section>
    </CrmContentContainer>
  );
}

