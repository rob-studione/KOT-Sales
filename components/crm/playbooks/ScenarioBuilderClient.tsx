"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GeneratedScenario } from "@/lib/crm/playbooks/generatedScenario";
import { parseGeneratedScenarioJson } from "@/lib/crm/playbooks/generatedScenario";
import {
  canAdvancePlaybookStatus,
  normalizePlaybookStatus,
  playbookStatusBadgeClasses,
  playbookStatusLabel,
  type PlaybookStatus,
} from "@/lib/crm/playbooks/playbookStatus";

export type ScenarioNode = {
  id: string;
  title: string;
  body: string;
  type: string;
  created_at: string;
};

export type ScenarioEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  label: string;
};

type ChoiceDraft = { key: string; label: string; to_node_id: string };

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k_${Math.random().toString(36).slice(2)}`;
}

export function ScenarioBuilderClient({
  playbookId,
  playbookName,
  playbookDescription,
  initialPlaybookStatus,
  initialStartNodeId,
  initialNodes,
  initialEdges,
}: {
  playbookId: string;
  playbookName: string;
  playbookDescription: string | null;
  initialPlaybookStatus: string;
  initialStartNodeId: string | null;
  initialNodes: ScenarioNode[];
  initialEdges: ScenarioEdge[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [pbName, setPbName] = useState(playbookName);
  const [pbDescription, setPbDescription] = useState(playbookDescription ?? "");
  const [pbSaving, setPbSaving] = useState(false);
  const [pbStatus, setPbStatus] = useState<PlaybookStatus>(() => normalizePlaybookStatus(initialPlaybookStatus));
  const [statusBusy, setStatusBusy] = useState(false);

  const [nodes, setNodes] = useState<ScenarioNode[]>(initialNodes);
  const [edges, setEdges] = useState<ScenarioEdge[]>(initialEdges);
  const [startNodeId, setStartNodeId] = useState<string | null>(initialStartNodeId);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodes[0]?.id ?? null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [nodeType, setNodeType] = useState("message");
  const [choices, setChoices] = useState<ChoiceDraft[]>([]);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [aiJson, setAiJson] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const targetOptions = useMemo(() => nodes.map((n) => ({ id: n.id, label: n.title || n.id.slice(0, 8) })), [nodes]);

  useEffect(() => {
    if (!selectedNodeId) {
      setTitle("");
      setBody("");
      setNodeType("message");
      setChoices([]);
      return;
    }
    const n = nodes.find((x) => x.id === selectedNodeId);
    if (!n) return;
    setTitle(n.title);
    setBody(n.body);
    setNodeType(n.type || "message");
    const outs = edges.filter((e) => e.from_node_id === selectedNodeId);
    setChoices(
      outs.map((e) => ({
        key: e.id,
        label: e.label,
        to_node_id: e.to_node_id,
      })),
    );
  }, [selectedNodeId, nodes, edges]);

  function showMessage(tone: "ok" | "err", text: string) {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 4000);
  }

  async function onAdvancePlaybookStatus(next: PlaybookStatus) {
    if (!canAdvancePlaybookStatus(pbStatus, next)) return;
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/crm/playbooks/${playbookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPbStatus(next);
      showMessage("ok", next === "active" ? "Scenarijus aktyvuotas." : "Scenarijus archyvuotas.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Klaida");
    } finally {
      setStatusBusy(false);
    }
  }

  async function onSavePlaybook() {
    const nextName = pbName.trim();
    if (!nextName) {
      showMessage("err", "Pavadinimas yra privalomas.");
      return;
    }

    setPbSaving(true);
    try {
      const desc = pbDescription.trim();
      const { error } = await supabase
        .from("playbooks")
        .update({
          name: nextName,
          description: desc ? desc : null,
        })
        .eq("id", playbookId);
      if (error) throw new Error(error.message);
      setPbName(nextName);
      setPbDescription(desc);
      showMessage("ok", "Scenarijaus nustatymai išsaugoti.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Klaida");
    } finally {
      setPbSaving(false);
    }
  }

  async function onSaveNode() {
    if (!selectedNodeId) return;
    setBusy(true);
    try {
      const { error: uErr } = await supabase
        .from("playbook_nodes")
        .update({ title: title.trim() || "Be pavadinimo", body, type: nodeType })
        .eq("id", selectedNodeId);
      if (uErr) throw new Error(uErr.message);

      const { error: dErr } = await supabase
        .from("playbook_edges")
        .delete()
        .eq("playbook_id", playbookId)
        .eq("from_node_id", selectedNodeId);
      if (dErr) throw new Error(dErr.message);

      const rows = choices
        .map((c) => ({
          playbook_id: playbookId,
          from_node_id: selectedNodeId,
          to_node_id: c.to_node_id,
          label: c.label.trim() || "…",
        }))
        .filter((r) => r.to_node_id);

      if (rows.length > 0) {
        const { data: ins, error: iErr } = await supabase.from("playbook_edges").insert(rows).select("id,from_node_id,to_node_id,label");
        if (iErr) throw new Error(iErr.message);
        const inserted = (ins ?? []) as ScenarioEdge[];
        setEdges((prev) => {
          const rest = prev.filter((e) => e.from_node_id !== selectedNodeId);
          return [...rest, ...inserted];
        });
      } else {
        setEdges((prev) => prev.filter((e) => e.from_node_id !== selectedNodeId));
      }

      setNodes((prev) =>
        prev.map((n) =>
          n.id === selectedNodeId
            ? {
                ...n,
                title: title.trim() || "Be pavadinimo",
                body,
                type: nodeType,
              }
            : n,
        ),
      );

      showMessage("ok", "Išsaugota.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Klaida");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateNode() {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("playbook_nodes")
        .insert({
          playbook_id: playbookId,
          title: "Naujas žingsnis",
          body: "",
          type: "message",
        })
        .select("id,title,body,type,created_at")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Insert failed");
      const row = data as ScenarioNode;
      setNodes((prev) => [...prev, row]);
      setSelectedNodeId(row.id);
      if (!startNodeId) {
        const { error: sErr } = await supabase.from("playbooks").update({ start_node_id: row.id }).eq("id", playbookId);
        if (!sErr) setStartNodeId(row.id);
      }
      showMessage("ok", "Žingsnis sukurtas.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Klaida");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteNode() {
    if (!selectedNodeId) return;
    if (!window.confirm("Pašalinti šį žingsnį ir susijusius pasirinkimus?")) return;
    setBusy(true);
    try {
      const deletedId = selectedNodeId;
      const restNodes = nodes.filter((n) => n.id !== deletedId);
      const { error } = await supabase.from("playbook_nodes").delete().eq("id", deletedId);
      if (error) throw new Error(error.message);

      setNodes(restNodes);
      setEdges((prev) => prev.filter((e) => e.from_node_id !== deletedId && e.to_node_id !== deletedId));

      if (startNodeId === deletedId) {
        const { error: pErr } = await supabase.from("playbooks").update({ start_node_id: null }).eq("id", playbookId);
        if (!pErr) setStartNodeId(null);
      }

      setSelectedNodeId((cur) => (cur === deletedId ? restNodes[0]?.id ?? null : cur));

      showMessage("ok", "Pašalinta.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Klaida");
    } finally {
      setBusy(false);
    }
  }

  async function onSetStartNode() {
    if (!selectedNodeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("playbooks").update({ start_node_id: selectedNodeId }).eq("id", playbookId);
      if (error) throw new Error(error.message);
      setStartNodeId(selectedNodeId);
      showMessage("ok", "Pradinis žingsnis nustatytas.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Klaida");
    } finally {
      setBusy(false);
    }
  }

  function addChoice() {
    const fallback = nodes.find((n) => n.id !== selectedNodeId)?.id ?? nodes[0]?.id ?? "";
    setChoices((prev) => [...prev, { key: newKey(), label: "", to_node_id: fallback }]);
  }

  function removeChoice(key: string) {
    setChoices((prev) => prev.filter((c) => c.key !== key));
  }

  async function onGenerateAi() {
    setAiBusy(true);
    try {
      const res = await fetch("/api/crm/playbooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: aiGoal, context: aiContext || undefined }),
      });
      const json = (await res.json()) as { ok?: boolean; scenario?: GeneratedScenario; raw?: string; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      if (json.scenario) {
        setAiJson(JSON.stringify(json.scenario, null, 2));
      } else if (typeof json.raw === "string" && json.raw.trim()) {
        setAiJson(json.raw);
      } else {
        setAiJson("{}");
      }
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Generavimo klaida");
    } finally {
      setAiBusy(false);
    }
  }

  async function onInsertAiJson() {
    const validated = parseGeneratedScenarioJson(aiJson);
    if (!validated.ok) {
      showMessage("err", validated.error);
      return;
    }
    const { nodes: genNodes, edges: genEdges } = validated.value;
    if (genNodes.length === 0) {
      showMessage("err", "Tuščias scenarijus.");
      return;
    }

    setBusy(true);
    try {
      const insertRows = genNodes.map((n) => ({
        playbook_id: playbookId,
        title: n.title,
        body: n.body,
        type: n.type === "end" ? "end" : "message",
      }));
      const { data: insNodes, error: nErr } = await supabase
        .from("playbook_nodes")
        .insert(insertRows)
        .select("id,title,body,type,created_at");
      if (nErr || !insNodes?.length) throw new Error(nErr?.message ?? "Nepavyko įterpti žingsnių");

      const created = insNodes as ScenarioNode[];
      const idByIndex = created.map((r) => r.id);

      const edgeRows = genEdges.map((e) => ({
        playbook_id: playbookId,
        from_node_id: idByIndex[e.from_index]!,
        to_node_id: idByIndex[e.to_index]!,
        label: e.label,
      }));
      if (edgeRows.length > 0) {
        const { data: insEdges, error: eErr } = await supabase.from("playbook_edges").insert(edgeRows).select("id,from_node_id,to_node_id,label");
        if (eErr) throw new Error(eErr.message);
        setEdges((prev) => [...prev, ...((insEdges ?? []) as ScenarioEdge[])]);
      }

      setNodes((prev) => [...prev, ...created]);
      setSelectedNodeId(created[0]!.id);
      setAiOpen(false);
      setAiGoal("");
      setAiContext("");
      showMessage("ok", "Scenarijaus fragmentas įterptas.");
    } catch (e) {
      showMessage("err", e instanceof Error ? e.message : "Klaida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <Link href="/scenarijai" className="font-medium text-zinc-600 hover:text-zinc-900">
              ← Scenarijai
            </Link>
            <span aria-hidden>·</span>
            <Link href={`/scenarijai/${playbookId}/run`} className="font-medium text-zinc-600 hover:text-zinc-900">
              Paleisti
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{pbName}</h1>
          <p className="mt-1 text-sm text-zinc-500">Redagavimas: žingsniai ir pasirinkimai (be grafiko).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100"
          >
            Generate scenario
          </button>
        </div>
      </div>

      {message ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Scenarijaus nustatymai</h2>
            <p className="mt-1 text-sm text-zinc-500">Pavadinimas ir aprašymas rodomi scenarijų sąraše.</p>
          </div>
          <button
            type="button"
            onClick={onSavePlaybook}
            disabled={pbSaving}
            className={[
              "inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800",
              pbSaving ? "cursor-wait opacity-70" : "",
            ].join(" ")}
          >
            {pbSaving ? "Saugoma…" : "Išsaugoti"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Pavadinimas</label>
            <input
              value={pbName}
              onChange={(e) => setPbName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="Pvz. Prarasto kliento reaktivacija"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Aprašymas (nebūtina)</label>
            <textarea
              value={pbDescription}
              onChange={(e) => setPbDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="Trumpas paaiškinimas, kada naudoti šį scenarijų."
            />
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Būsena</label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span
              className={[
                "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                playbookStatusBadgeClasses(pbStatus),
              ].join(" ")}
            >
              {playbookStatusLabel(pbStatus)}
            </span>
            {pbStatus === "draft" ? (
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => onAdvancePlaybookStatus("active")}
                className={[
                  "inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100",
                  statusBusy ? "cursor-wait opacity-70" : "",
                ].join(" ")}
              >
                {statusBusy ? "…" : "Aktyvuoti"}
              </button>
            ) : null}
            {pbStatus === "active" ? (
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => onAdvancePlaybookStatus("archived")}
                className={[
                  "inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50",
                  statusBusy ? "cursor-wait opacity-70" : "",
                ].join(" ")}
              >
                {statusBusy ? "…" : "Archyvuoti"}
              </button>
            ) : null}
            {pbStatus === "archived" ? (
              <p className="text-sm text-zinc-500">Archyvuoto scenarijaus būsenos čia keisti negalima.</p>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Tik <span className="font-medium text-zinc-600">Active</span> scenarijų galima paleisti per „Paleisti“.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <div className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Žingsniai</h2>
            <button
              type="button"
              onClick={onCreateNode}
              disabled={busy}
              className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              + Naujas
            </button>
          </div>
          <ul className="mt-3 max-h-[min(70vh,560px)] space-y-1 overflow-y-auto pr-1">
            {nodes.length === 0 ? (
              <li className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500">
                Nėra žingsnių. Sukurkite pirmą.
              </li>
            ) : (
              nodes.map((n) => {
                const active = n.id === selectedNodeId;
                const isStart = n.id === startNodeId;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(n.id)}
                      className={[
                        "flex w-full flex-col items-start rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "border-zinc-900 bg-zinc-50 font-medium text-zinc-900"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50/80",
                      ].join(" ")}
                    >
                      <span className="line-clamp-2">{n.title || "Be pavadinimo"}</span>
                      {isStart ? (
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Pradžia</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm">
          {!selectedNodeId ? (
            <p className="text-sm text-zinc-500">Pasirinkite žingsnį iš sąrašo arba sukurkite naują.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onSaveNode}
                  disabled={busy}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                >
                  Išsaugoti
                </button>
                <button
                  type="button"
                  onClick={onSetStartNode}
                  disabled={busy}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                >
                  Nustatyti pradžia
                </button>
                <button
                  type="button"
                  onClick={onDeleteNode}
                  disabled={busy}
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 shadow-sm hover:bg-red-100 disabled:opacity-50"
                >
                  Šalinti žingsnį
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Pavadinimas</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipas</label>
                <select
                  value={nodeType}
                  onChange={(e) => setNodeType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                >
                  <option value="message">message</option>
                  <option value="end">end</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Turinys</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pasirinkimai (šakos)</label>
                  <button
                    type="button"
                    onClick={addChoice}
                    className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
                  >
                    + Pasirinkimas
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {choices.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-sm text-zinc-500">
                      Nėra šakų iš šio žingsnio. Pridėkite pasirinkimą arba palikite tuščią pabaigos žingsniui.
                    </p>
                  ) : (
                    choices.map((c) => (
                      <div key={c.key} className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Etiketė</span>
                          <input
                            value={c.label}
                            onChange={(e) =>
                              setChoices((prev) => prev.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))
                            }
                            className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Tikslinis žingsnis</span>
                          <select
                            value={c.to_node_id}
                            onChange={(e) =>
                              setChoices((prev) => prev.map((x) => (x.key === c.key ? { ...x, to_node_id: e.target.value } : x)))
                            }
                            className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          >
                            {targetOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeChoice(c.key)}
                          className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                        >
                          Šalinti
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {aiOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
          onClick={() => setAiOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ai-modal-title" className="text-lg font-semibold text-zinc-900">
              Generate scenario
            </h2>
            <p className="mt-1 text-sm text-zinc-500">Aprašyk tikslą; gausite JSON ir galėsite įterpti į šį scenarijų.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tikslas</label>
                <textarea
                  value={aiGoal}
                  onChange={(e) => setAiGoal(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                  placeholder="Pvz. prarasto kliento reaktivacija telefonu"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kontekstas (nebūtina)</label>
                <textarea
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                />
              </div>
              <button
                type="button"
                disabled={aiBusy || !aiGoal.trim()}
                onClick={onGenerateAi}
                className="w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {aiBusy ? "Generuojama…" : "Generuoti JSON"}
              </button>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">JSON (nodes + edges)</label>
                <textarea
                  value={aiJson}
                  onChange={(e) => setAiJson(e.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Uždaryti
              </button>
              <button
                type="button"
                disabled={busy || !aiJson.trim()}
                onClick={onInsertAiJson}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Įterpti į DB
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
