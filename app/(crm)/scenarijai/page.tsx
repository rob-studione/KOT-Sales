import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { NewPlaybookButton } from "@/components/crm/playbooks/NewPlaybookButton";
import { PlaybooksListClient } from "@/components/crm/playbooks/PlaybooksListClient";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

type PlaybookRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  status: string;
};

export default async function ScenarijaiPage() {
  let supabase: Awaited<ReturnType<typeof createSupabaseSsrReadOnlyClient>>;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return (
      <CrmTableContainer>
        <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>
      </CrmTableContainer>
    );
  }

  const { data, error } = await supabase
    .from("playbooks")
    .select("id,name,description,created_at,status")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <CrmTableContainer>
        <p className="text-sm text-red-600">Nepavyko įkelti scenarijų: {error.message}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Jei tai pirmas kartas, pritaikykite migraciją su lentelėmis <code className="rounded bg-zinc-100 px-1">playbooks</code>,
          <code className="ml-1 rounded bg-zinc-100 px-1">playbook_nodes</code>, <code className="ml-1 rounded bg-zinc-100 px-1">playbook_edges</code>.
        </p>
      </CrmTableContainer>
    );
  }

  const rows = (data ?? []) as PlaybookRow[];

  return (
    <CrmTableContainer className="py-6">
      <div className="mx-auto w-full max-w-[800px]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Scenarijai</h1>
          <NewPlaybookButton />
        </div>
        <p className="mb-5 text-sm text-zinc-500">
          Pokalbio scenarijai, padedantys vesti klientą per pardavimo procesą.
        </p>

        <PlaybooksListClient initialRows={rows} />
      </div>
    </CrmTableContainer>
  );
}

