import Link from "next/link";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { PlaybookRunnerClient } from "@/components/crm/playbooks/PlaybookRunnerClient";
import { normalizePlaybookStatus } from "@/lib/crm/playbooks/playbookStatus";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

type PlaybookRow = {
  id: string;
  name: string;
  start_node_id: string | null;
  status: string;
};

type NodeRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  created_at: string;
};

type EdgeRow = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  label: string;
};

export default async function PlaybookRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof createSupabaseSsrReadOnlyClient>>;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </CrmTableContainer>
    );
  }

  const pb = await supabase.from("playbooks").select("id,name,start_node_id,status").eq("id", id).maybeSingle();
  if (pb.error) {
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-red-600">Nepavyko įkelti scenarijaus: {pb.error.message}</p>
      </CrmTableContainer>
    );
  }
  const playbook = (pb.data ?? null) as PlaybookRow | null;
  if (!playbook) {
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-zinc-600">Scenarijus nerastas.</p>
      </CrmTableContainer>
    );
  }

  const runStatus = normalizePlaybookStatus(playbook.status);
  if (runStatus !== "active") {
    const hint =
      runStatus === "draft"
        ? "Šis scenarijus yra juodraštis. Aktyvuokite jį redagavimo puslapyje, kad būtų galima paleisti."
        : "Šis scenarijus archyvuotas ir negali būti paleistas.";
    return (
      <CrmTableContainer className="py-6">
        <div className="mx-auto w-full max-w-[600px] px-4">
          <p className="text-sm font-semibold text-zinc-900">{playbook.name}</p>
          <p className="mt-2 text-sm text-zinc-600">{hint}</p>
          <p className="mt-4 text-sm">
            <Link href={`/scenarijai/${id}/edit`} className="font-medium text-zinc-700 underline">
              Atidaryti redagavimą
            </Link>
            <span className="text-zinc-400"> · </span>
            <Link href="/scenarijai" className="font-medium text-zinc-700 underline">
              ← Scenarijai
            </Link>
          </p>
        </div>
      </CrmTableContainer>
    );
  }

  const nodesRes = await supabase
    .from("playbook_nodes")
    .select("id,title,body,type,created_at")
    .eq("playbook_id", id)
    .order("created_at", { ascending: true });

  if (nodesRes.error) {
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-red-600">Nepavyko įkelti žingsnių: {nodesRes.error.message}</p>
      </CrmTableContainer>
    );
  }

  const nodes = (nodesRes.data ?? []) as NodeRow[];
  const preferredStart =
    playbook.start_node_id && nodes.some((n) => n.id === playbook.start_node_id) ? playbook.start_node_id : null;
  const initialNodeId = preferredStart ?? nodes[0]?.id ?? "";

  const edgesRes = await supabase
    .from("playbook_edges")
    .select("id,from_node_id,to_node_id,label")
    .eq("playbook_id", id);

  if (edgesRes.error) {
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-red-600">Nepavyko įkelti pasirinkimų: {edgesRes.error.message}</p>
      </CrmTableContainer>
    );
  }

  const edges = (edgesRes.data ?? []) as EdgeRow[];

  if (!initialNodeId) {
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-zinc-600">Šis scenarijus neturi žingsnių.</p>
      </CrmTableContainer>
    );
  }

  return <PlaybookRunnerClient playbookName={playbook.name} initialNodeId={initialNodeId} nodes={nodes} edges={edges} />;
}

