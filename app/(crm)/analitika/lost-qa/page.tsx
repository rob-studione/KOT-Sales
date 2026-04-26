import Link from "next/link";
import { CrmAnalyticsHeader } from "@/components/crm/CrmAnalyticsHeader";
import { CrmContentContainer } from "@/components/crm/CrmContentContainer";
import { LostQaAnalyticsFilters } from "@/components/crm/LostQaAnalyticsFilters";
import { displayAssignedAgentFromMessages } from "@/lib/crm/lostQa/agentDisplay";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import {
  LOST_PRIMARY_REASON_LABEL_LT,
  lostPrimaryReasonLabelLtOrDefault,
} from "@/lib/crm/lostQa/reasonLabelLt";
import type { LostPrimaryReason } from "@/lib/crm/lostQaDb";

export const dynamic = "force-dynamic";

type TopReasonRow = { reason: string; count: number };
type FocusMetricKey = "price" | "competitor" | "quality";
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

function reasonLabelLt(code: unknown): string {
  const s = String(code ?? "").trim();
  if (!s) return s;
  if (s in LOST_PRIMARY_REASON_LABEL_LT) {
    return LOST_PRIMARY_REASON_LABEL_LT[s as LostPrimaryReason];
  }
  const d = lostPrimaryReasonLabelLtOrDefault(s);
  if (d !== s) return d;
  if (s.includes("_")) {
    return (
      s
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") || s
    );
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

function humanizeActionPoint(text: string): string {
  let out = text.trim();
  if (!out) return out;

  out = out.replace(/^Jei klientas prašo /i, "Jei klientas prašo ");
  out = out.replace(/^Jei klientas užsimena apie /i, "Jei klientas užsimena apie ");
  out = out.replace(/\\bpatikrink\\b/gi, "verta pasitikrinti");
  out = out.replace(/\\bpatikrinkite\\b/gi, "verta pasitikrinti");
  out = out.replace(/\\bpateikiant pasiūlymą\\b/gi, "prieš pasiūlymą");
  out = out.replace(/\\bužfiksuota\\b/gi, "turėjome");
  out = out.replace(/\\batliekami patikslinimai\\b/gi, "tikslinant");
  out = out.replace(/\\bpadidintum užsakymo tikimybę\\b/gi, "kad klientas lengviau apsispręstų");
  out = out.replace(/\\bpadidintumėte užsakymo tikimybę\\b/gi, "kad klientas lengviau apsispręstų");

  if (/^Jei klientas užsimena apie papildomas paslaugas/i.test(out) && !out.includes("verta")) {
    out = out.replace(/, /, ", verta ");
  }

  return out;
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

function recommendationMatchesFocus(text: string, focus: FocusMetricKey): boolean {
  const t = text.toLowerCase();
  if (focus === "price") return /(kain|pasi[ūu]lym|biudžet|kainodar|vert)/.test(t);
  if (focus === "competitor") return /(konkurent|išskirt|skirtum|palygin|vertė|kodėl rinktis)/.test(t);
  return /(kokyb|aišk|atsak|turin|detal|klausim|komunik)/.test(t);
}

function managerDisplayName(nameOrEmail: string | null | undefined): string {
  const v = String(nameOrEmail ?? "").trim();
  if (!v) return "Vadybininkas";
  return v.toLowerCase().includes("vertimų karaliai") ? "Vadybininkas" : v;
}

/** Agreguojant „Visas pašto dėžutes“: jei dienai yra suvestinė pagal dėžutes, globalios (null) tos dienos nenaudojamos. Jei dėžučių nėra, rodoma globali. */
function selectRowsForAllMailboxesView(rows: DailySummaryRow[]): DailySummaryRow[] {
  const byDate = new Map<string, DailySummaryRow[]>();
  for (const r of rows) {
    const k = r.summary_date;
    const list = byDate.get(k) ?? [];
    list.push(r);
    byDate.set(k, list);
  }
  const out: DailySummaryRow[] = [];
  for (const list of byDate.values()) {
    const perMb = list.filter((x) => x.mailbox_id != null);
    if (perMb.length) {
      out.push(...perMb);
    } else {
      out.push(...list);
    }
  }
  return out.sort(
    (a, b) =>
      a.summary_date.localeCompare(b.summary_date) || String(a.mailbox_id).localeCompare(String(b.mailbox_id))
  );
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
    if (mailbox !== "all") {
      q = q.eq("mailbox_id", mailbox);
    }
    const { data, error } = await q.order("mailbox_id", { ascending: true, nullsFirst: false });
    if (error) throw error;
    const raw = (data as DailySummaryRow[] | null) ?? [];
    effectiveRows = mailbox === "all" ? selectRowsForAllMailboxesView(raw) : raw;
  } else {
    let q = supabase
      .from("lost_daily_summaries")
      .select("*")
      .gte("summary_date", from)
      .lte("summary_date", to)
      .order("summary_date", { ascending: true });
    if (mailbox !== "all") {
      q = q.eq("mailbox_id", mailbox);
    }
    const { data, error } = await q;
    if (error) throw error;
    const raw = (data as DailySummaryRow[] | null) ?? [];
    effectiveRows = mailbox === "all" ? selectRowsForAllMailboxesView(raw) : raw;
  }

  const selectedLabel = mode === "day" ? `Data: ${date}` : `Intervalas: ${from} – ${to}`;

  const topReasons = mergeTopReasons(effectiveRows);
  const actionPoints = mergeActionPoints(effectiveRows);
  const priorityCases = mergePriorityCases(effectiveRows);

  const summaryMetrics = {
    total_lost_count: effectiveRows.reduce((sum, r) => sum + n(r.total_lost_count), 0),
    price_issue_count: effectiveRows.reduce((sum, r) => sum + n(r.price_issue_count), 0),
    competitor_count: effectiveRows.reduce((sum, r) => sum + n(r.competitor_count), 0),
    response_quality_issue_count: effectiveRows.reduce((sum, r) => sum + n(r.response_quality_issue_count), 0),
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

  const topProblemCards = [
    { key: "price" as const, label: "Kainos problema", value: summaryMetrics.price_issue_count },
    { key: "competitor" as const, label: "Pasirinko konkurentą", value: summaryMetrics.competitor_count },
    { key: "quality" as const, label: "Atsakymo kokybės problema", value: summaryMetrics.response_quality_issue_count },
  ];
  const topProblem = [...topProblemCards].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))[0];
  const topReason = topReasons[0] ?? null;
  const filteredActionPoints = actionPoints.filter((t) => recommendationMatchesFocus(t, topProblem.key));
  const displayedActionPoints = (filteredActionPoints.length ? filteredActionPoints : actionPoints).slice(0, 3);

  const focusedSummary = topReason
    ? `Didžiausia problema – ${reasonLabelLt(topReason.reason).toLowerCase()} (${topReason.count} iš ${summaryMetrics.total_lost_count} atvejų).`
    : mode === "day"
      ? `${date} neturėjome Lost QA suvestinės.`
      : `Per laikotarpį nuo ${from} iki ${to} neturėjome Lost QA suvestinių.`;

  const topManagers = new Map<string, { label: string; count: number }>();
  for (const c of priorityCases) {
    const assignedAgentDisplay = displayAssignedAgentFromMessages(messagesByCase.get(c.lost_case_id) ?? [], c.assigned_agent_email);
    const label = managerDisplayName(assignedAgentDisplay.value);
    const prev = topManagers.get(label);
    if (prev) prev.count += 1;
    else topManagers.set(label, { label, count: 1 });
  }
  const managerRows = [...topManagers.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 3);

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
          <LostQaAnalyticsFilters mailboxOptions={mailboxOptions} mailbox={mailbox} mode={mode} preset={preset} date={date} from={from} to={to} />
        }
      />

      {!effectiveRows.length ? (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-base font-semibold text-gray-900">Nėra duomenų</h3>
          <p className="mt-2 text-sm text-gray-600">
            {mode === "day" ? `Pasirinktai datai (${date}) neradome suvestinės.` : `Pasirinktame laikotarpyje nuo ${from} iki ${to} neradome suvestinių.`}
          </p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-600">Prarasti klientai</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summaryMetrics.total_lost_count}</div>
        </div>
        {topProblemCards.map((card) => {
          const isTop = card.key === topProblem.key;
          return (
            <div key={card.key} className={`rounded-lg border bg-white p-4 ${isTop ? "border-amber-300 bg-amber-50/60 shadow-sm" : "border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className={`text-sm ${isTop ? "font-semibold text-gray-900" : "text-gray-600"}`}>{card.label}</div>
                {isTop ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Dažniausia problema</span>
                ) : null}
              </div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{card.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">Pagrindinės priežastys</h3>
          {topReasons.length ? (
            <ul className="mt-4 space-y-2">
              {topReasons.map((r, index) => (
                <li key={`${r.reason}-${r.count}`} className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${index === 0 ? "bg-amber-50 text-gray-900" : "text-gray-600"}`}>
                  <span className={index === 0 ? "text-base font-bold text-gray-900" : "text-gray-600"}>{reasonLabelLt(r.reason)}</span>
                  <span className={`rounded px-2 py-0.5 ${index === 0 ? "bg-amber-100 text-gray-900" : "bg-gray-100 text-gray-600"}`}>{n(r.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-600">Kol kas nematyti pasikartojančių priežasčių.</p>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">Atsakingi vadybininkai</h3>
          {managerRows.length ? (
            <ul className="mt-4 space-y-2">
              {managerRows.map((r) => (
                <li key={`${r.label}-${r.count}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-800">{r.label}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{n(r.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-600">Šiam pasirinkimui vadybininkų įrašų nėra.</p>
          )}
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-base font-semibold text-gray-900">Rekomendacijos komandai</h3>
          {displayedActionPoints.length ? (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-900">
              {displayedActionPoints.map((t, idx) => (
                <li key={`${idx}-${t.slice(0, 32)}`}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-700">Šiam laikotarpiui papildomų rekomendacijų nėra.</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-base font-semibold text-gray-900">Santrauka</h3>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{focusedSummary}</p>
      </section>

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
                {priorityCases.map((c, index) => {
                  const assignedAgentDisplay = displayAssignedAgentFromMessages(messagesByCase.get(c.lost_case_id) ?? [], c.assigned_agent_email);
                  return (
                    <tr key={c.lost_case_id} className={`align-top ${index === 0 ? "bg-amber-50/60" : ""}`}>
                      <td className="border-b border-gray-100 py-3 pr-4">
                        <div className="min-w-[260px] max-w-[520px] truncate" title={c.subject ?? ""}>
                          {c.subject ? (
                            <Link href={`/lost-qa/${c.lost_case_id}`} className="text-gray-900 hover:underline" title={c.subject}>
                              {c.subject}
                            </Link>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-gray-100 py-3 pr-4">
                        <span className="text-xs text-gray-800">{reasonLabelLt(c.primary_reason)}</span>
                        {index === 0 ? (
                          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Top atvejis</div>
                        ) : null}
                      </td>
                      <td className="border-b border-gray-100 py-3">{assignedAgentDisplay.value ?? <span className="text-gray-500">—</span>}</td>
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

