import Link from "next/link";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { ScenarioBuilderClient } from "@/components/crm/playbooks/ScenarioBuilderClient";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

type PlaybookRow = {
  id: string;
  name: string;
  description: string | null;
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

export default async function ScenarioEditPage({ params }: { params: Promise<{ id: string }> }) {
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

  const pb = await supabase
    .from("playbooks")
    .select("id,name,description,start_node_id,status")
    .eq("id", id)
    .maybeSingle();

  if (pb.error) {
    const msg = pb.error.message;
    const missingCol = msg.includes("start_node_id") || msg.includes("column");
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-red-600">Nepavyko įkelti scenarijaus: {msg}</p>
        {missingCol ? (
          <p className="mt-2 text-xs text-zinc-600">
            Jei klaida apie <code className="rounded bg-zinc-100 px-1">start_node_id</code>, pritaikykite migraciją{" "}
            <code className="rounded bg-zinc-100 px-1">0098_playbooks_start_node_id.sql</code>.
          </p>
        ) : null}
        <p className="mt-3 text-sm">
          <Link href="/scenarijai" className="font-medium text-zinc-700 underline">
            ← Atgal į sąrašą
          </Link>
        </p>
      </CrmTableContainer>
    );
  }

  const playbook = (pb.data ?? null) as PlaybookRow | null;
  if (!playbook) {
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-zinc-600">Scenarijus nerastas.</p>
        <p className="mt-3 text-sm">
          <Link href="/scenarijai" className="font-medium text-zinc-700 underline">
            ← Atgal
          </Link>
        </p>
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

  const edgesRes = await supabase
    .from("playbook_edges")
    .select("id,from_node_id,to_node_id,label")
    .eq("playbook_id", id);

  if (edgesRes.error) {
    return (
      <CrmTableContainer className="py-6">
        <p className="text-sm text-red-600">Nepavyko įkelti ryšių: {edgesRes.error.message}</p>
      </CrmTableContainer>
    );
  }

  const nodes = (nodesRes.data ?? []) as NodeRow[];
  const edges = (edgesRes.data ?? []) as EdgeRow[];

  const startOk =
    playbook.start_node_id && nodes.some((n) => n.id === playbook.start_node_id) ? playbook.start_node_id : null;

  return (
    <CrmTableContainer className="py-0">
      <ScenarioBuilderClient
        playbookId={playbook.id}
        playbookName={playbook.name}
        playbookDescription={playbook.description}
        initialPlaybookStatus={playbook.status}
        initialStartNodeId={startOk}
        initialNodes={nodes}
        initialEdges={edges}
      />
    </CrmTableContainer>
  );
}
