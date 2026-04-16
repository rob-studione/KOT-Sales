import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { fetchCrmUsers } from "@/lib/crm/crmUsers";
import { projectWorkItemCount, type ProjectListRow } from "@/lib/crm/projectListHelpers";
import { ProjectsListHub } from "@/components/crm/projects/ProjectsListHub";

export const dynamic = "force-dynamic";

type StatusFilter = "active" | "archived" | "deleted";

function parseStatusFilter(raw: unknown): StatusFilter {
  if (raw === "deleted") return "deleted";
  if (raw === "archived") return "archived";
  return "active";
}

export default async function ProjektaiListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const sp = await searchParams;
  const statusRaw = typeof sp.status === "string" ? sp.status : undefined;
  const statusFilter = parseStatusFilter(statusRaw);

  let supabase;
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

  const users = await fetchCrmUsers(supabase);
  const userById = new Map(users.map((u) => [u.id, u]));

  let ownerColumnAvailable = true;
  let data: unknown = null;
  let error: { message: string } | null = null;
  let deletedAtAvailable = true;

  const deletedAtSelect = ",deleted_at";
  const withOwnerSelectBase =
    "id,name,description,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at,owner_user_id,project_work_items(count)";
  const withoutOwnerSelectBase =
    "id,name,description,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at,project_work_items(count)";

  const withOwnerSelect = withOwnerSelectBase + deletedAtSelect;
  const withoutOwnerSelect = withoutOwnerSelectBase + deletedAtSelect;

  const first = await supabase.from("projects").select(withOwnerSelect).order("created_at", { ascending: false });
  if (first.error) {
    const msg = String(first.error.message ?? "");
    const missingOwner =
      msg.includes("owner_user_id") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));
    const missingDeletedAt =
      msg.includes("deleted_at") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));
    if (missingOwner) {
      ownerColumnAvailable = false;
      const retry = await supabase.from("projects").select(withoutOwnerSelect).order("created_at", { ascending: false });
      data = retry.data;
      error = retry.error ? { message: retry.error.message } : null;
    } else if (missingDeletedAt) {
      deletedAtAvailable = false;
      const retry = await supabase.from("projects").select(withOwnerSelectBase).order("created_at", { ascending: false });
      data = retry.data;
      error = retry.error ? { message: retry.error.message } : null;
    } else {
      error = { message: first.error.message };
    }
  } else {
    data = first.data;
  }

  if (error) {
    return (
      <CrmTableContainer>
        <p className="text-sm text-red-600">Nepavyko įkelti: {error.message}</p>
        <p className="mt-2 text-xs text-gray-500">
          Pritaikykite migracijas{" "}
          <code className="rounded bg-gray-100 px-1">0014_projects_snapshot.sql</code> ir{" "}
          <code className="rounded bg-gray-100 px-1">0015_project_campaign_work_items.sql</code>.
        </p>
      </CrmTableContainer>
    );
  }

  const rows = (data ?? []) as ProjectListRow[];
  const activeCount = rows.filter((p) => p.status === "active").length;
  const archivedCount = rows.filter((p) => p.status === "archived").length;
  const deletedCount = rows.filter((p) => p.status === "deleted").length;

  const filteredRows = rows.filter((p) => {
    if (statusFilter === "deleted") return p.status === "deleted";
    if (statusFilter === "archived") return p.status === "archived";
    return p.status === "active";
  });

  const kpi = {
    projectCount: filteredRows.length,
    totalWorkItems: filteredRows.reduce((s, p) => s + projectWorkItemCount(p), 0),
    assignedProjects: filteredRows.filter((p) => p.owner_user_id).length,
  };

  return (
    <ProjectsListHub
      rows={filteredRows}
      userById={userById}
      ownerColumnAvailable={ownerColumnAvailable}
      statusFilter={statusFilter}
      counts={{ active: activeCount, archived: archivedCount, deleted: deletedCount }}
      deletedAtAvailable={deletedAtAvailable}
      kpi={kpi}
    />
  );
}
