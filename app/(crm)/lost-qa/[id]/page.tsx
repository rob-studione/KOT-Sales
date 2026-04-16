import Link from "next/link";
import { notFound } from "next/navigation";

import { CrmAnalyticsHeader } from "@/components/crm/CrmAnalyticsHeader";
import { CrmContentContainer } from "@/components/crm/CrmContentContainer";
import { displayAssignedAgentFromMessages } from "@/lib/crm/lostQa/agentDisplay";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

type CaseRow = {
  id: string;
  subject: string | null;
  client_email: string | null;
  assigned_agent_email: string | null;
  lost_detected_at: string;
  status: string;
  mailbox_id: string;
};

type MessageRow = {
  sender_name: string | null;
  sender_email: string | null;
  sender_role: string;
  body_clean: string | null;
  body_plain: string | null;
  snippet: string | null;
  created_at: string;
};

type AnalysisRow = {
  primary_reason: string;
  primary_reason_lt?: string | null;
  confidence: number;
  competitor_mentioned: boolean;
  price_issue: boolean;
  response_speed_issue: boolean;
  response_quality_issue: boolean;
  why_lost_lt?: string | null;
  what_to_do_better_lt?: string | null;
  key_moments?: unknown;
  analysis_json?: unknown;
};

const STATUS_LT: Record<string, string> = {
  analyzed: "Išanalizuota",
  pending_analysis: "Laukia analizės",
};

function fmtDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function statusLabelLt(status: string): string {
  const s = String(status ?? "").trim();
  return STATUS_LT[s] ?? s;
}

function senderLabel(m: MessageRow): string {
  const role = (m.sender_role ?? "").trim();
  const name = (m.sender_name ?? "").trim();
  const email = (m.sender_email ?? "").trim();
  const who = name || email || "—";
  return role ? `${who} (${role})` : who;
}

function messageText(m: MessageRow): string {
  return (m.body_clean ?? m.body_plain ?? m.snippet ?? "").trim();
}

function flagLabel(on: boolean, label: string) {
  return (
    <span
      className={
        on
          ? "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
          : "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
      }
    >
      {label}
    </span>
  );
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
}

function extractSummaryLt(a: AnalysisRow | null): string[] {
  if (!a) return [];
  const aj = (a.analysis_json ?? null) as any;
  const arr = asStringArray(aj?.summary_lt);
  if (arr.length) return arr;
  return [];
}

function extractKeyMoments(a: AnalysisRow | null): Array<{ type: "client" | "agent"; text: string }> {
  if (!a) return [];
  const raw = a.key_moments;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ type: "client" | "agent"; text: string }> = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as any;
    const type = o.type === "client" || o.type === "agent" ? o.type : null;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!type || !text) continue;
    out.push({ type, text });
  }
  return out;
}

function extractWhatToDoBetter(a: AnalysisRow | null): string[] {
  if (!a) return [];
  const aj = (a.analysis_json ?? null) as any;
  const raw = String(a.what_to_do_better_lt ?? aj?.what_to_do_better_lt ?? "").trim();
  if (!raw) return [];

  const newlineSplit = raw
    .split(/\r?\n+/)
    .map((x) => x.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean);
  if (newlineSplit.length > 1) return newlineSplit;

  return raw
    .split(/(?<=[.!?])\s+(?=[A-ZĄČĘĖĮŠŲŪŽ])/u)
    .map((x) => x.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean);
}

export default async function LostQaCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseSsrReadOnlyClient();

  const { data: c, error: cErr } = await supabase
    .from("lost_cases")
    .select("id,subject,client_email,assigned_agent_email,lost_detected_at,status,mailbox_id")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!c) notFound();
  const caseRow = c as CaseRow;

  const [{ data: msgs, error: mErr }, { data: analysis, error: aErr }] = await Promise.all([
    supabase
      .from("lost_case_messages")
      .select("sender_name,sender_email,sender_role,body_clean,body_plain,snippet,created_at")
      .eq("lost_case_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("lost_case_analysis")
      .select(
        "primary_reason,primary_reason_lt,confidence,competitor_mentioned,price_issue,response_speed_issue,response_quality_issue,why_lost_lt,what_to_do_better_lt,key_moments,analysis_json"
      )
      .eq("lost_case_id", id)
      .order("prompt_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (mErr) throw mErr;
  if (aErr) throw aErr;

  const messages = (msgs as MessageRow[] | null) ?? [];
  const a = (analysis as AnalysisRow | null) ?? null;
  const summaryLt = extractSummaryLt(a);
  const keyMoments = extractKeyMoments(a);
  const whatToDoBetter = extractWhatToDoBetter(a);
  const assignedAgentDisplay = displayAssignedAgentFromMessages(messages, caseRow.assigned_agent_email);

  return (
    <CrmContentContainer className="py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <CrmAnalyticsHeader
          title={caseRow.subject?.trim() ? caseRow.subject : "—"}
          description={
            <div className="space-y-1">
              <div className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Klientas:</span>{" "}
                {caseRow.client_email ?? <span className="text-gray-500">—</span>}
              </div>
              <div className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Atsakingas vadybininkas:</span>{" "}
                {assignedAgentDisplay.value ?? <span className="text-gray-500">—</span>}
                <span className="ml-2 text-xs text-gray-500">
                  (source: {assignedAgentDisplay.source})
                </span>
              </div>
              <div className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Data:</span> {fmtDateTime(caseRow.lost_detected_at)}{" "}
                <span className="text-gray-400">•</span>{" "}
                <span className="font-medium text-gray-900">Statusas:</span> {statusLabelLt(caseRow.status)}
              </div>
            </div>
          }
        />
        <Link
          href="/lost-qa"
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Atgal
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">Analizė</h3>
          {a ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-600">Pagrindinė priežastis</div>
                <div className="mt-2 inline-flex max-w-full items-center rounded-full bg-amber-100 px-4 py-2 text-base font-semibold text-amber-950">
                  {a.primary_reason_lt?.trim() || a.primary_reason}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {flagLabel(a.price_issue, "Kaina")}
                {flagLabel(a.competitor_mentioned, "Konkurentas")}
                {flagLabel(a.response_speed_issue, "Greitis")}
                {flagLabel(a.response_quality_issue, "Kokybė")}
              </div>

              <div>
                <div className="text-sm font-medium text-gray-900">Santrauka</div>
                {summaryLt.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-800">
                    {summaryLt.map((x, i) => (
                      <li key={`${i}-${x.slice(0, 24)}`}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">Santraukos nėra.</p>
                )}
              </div>

              <div>
                <div className="text-sm font-medium text-gray-900">Kodėl praradome klientą</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {a.why_lost_lt?.trim() ? a.why_lost_lt : <span className="text-gray-600">—</span>}
                </p>
              </div>

              {whatToDoBetter.length ? (
                <div>
                  <div className="text-sm font-medium text-gray-900">Ką daryti geriau</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-800">
                    {whatToDoBetter.map((line, i) => (
                      <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <div className="text-sm font-medium text-gray-900">Svarbiausi momentai</div>
                {keyMoments.length ? (
                  <div className="mt-2 space-y-2 text-sm text-gray-800">
                    {keyMoments.map((km, i) => (
                      <div key={`${km.type}-${i}`} className="rounded-md bg-gray-50 px-3 py-2">
                        <div className="font-medium text-gray-900">
                          {km.type === "client" ? "Klientas" : "Agentas"}:
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">{km.text}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">Momentų nėra.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-600">Analizės dar nėra.</p>
          )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <details className="group">
          <summary className="cursor-pointer select-none text-base font-semibold text-gray-900">
            Rodyti pilną susirašinėjimą
          </summary>
          {messages.length ? (
            <div className="mt-4 space-y-3">
              {messages.map((m, idx) => {
                const role = (m.sender_role ?? "").toLowerCase();
                const isClient = role === "client";
                const text = messageText(m);
                return (
                  <div key={`${m.created_at}-${idx}`} className={`flex ${isClient ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        isClient ? "bg-gray-50 text-gray-900" : "bg-zinc-100 text-gray-900"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                        <span className="truncate">{senderLabel(m)}</span>
                        <span className="shrink-0 font-mono">{fmtDateTime(m.created_at)}</span>
                      </div>
                      <div className="whitespace-pre-wrap">{text || <span className="text-gray-500">—</span>}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-600">Žinučių nėra.</p>
          )}
        </details>
      </section>
    </CrmContentContainer>
  );
}

