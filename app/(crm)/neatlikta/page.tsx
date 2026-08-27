import { ManagerObligationsProjectList } from "@/components/crm/manager-obligations/ManagerObligationsProjectList";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { groupManagerObligationsByProject, loadManagerObligations } from "@/lib/crm/managerObligations";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export default async function NeatliktaPage() {
  const user = await getCurrentCrmUser();
  if (!user) {
    return (
      <CrmTableContainer>
        <p className="text-sm text-red-600">Neprisijungta.</p>
      </CrmTableContainer>
    );
  }

  let rows: ReturnType<typeof groupManagerObligationsByProject> = [];
  try {
    const supabase = await createSupabaseSsrReadOnlyClient();
    const payload = await loadManagerObligations(supabase, user.id);
    rows = groupManagerObligationsByProject(payload.items);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return (
      <CrmTableContainer>
        <p className="text-sm text-red-600">Nepavyko užkrauti sąrašo. {message}</p>
      </CrmTableContainer>
    );
  }

  const total = rows.reduce((n, r) => n + r.total, 0);

  return (
    <CrmTableContainer className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Neatlikta</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {total > 0
            ? `${total} ${total === 1 ? "veiksmas" : "veiksmai"} ${rows.length === 1 ? "projekte" : `${rows.length} projektuose`} — atidarykite Kanban ir patvirtinkite.`
            : "Jūsų priskirtų kortelių neatliktų veiksmų nėra."}
        </p>
      </div>

      <ManagerObligationsProjectList rows={rows} />
    </CrmTableContainer>
  );
}
