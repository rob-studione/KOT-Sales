import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { fetchCrmUsers, type CrmUser } from "@/lib/crm/crmUsers";
import { attachProjectWorkItemCounts } from "@/lib/crm/attachProjectWorkItemCounts";
import { fetchProjektaiListPayload } from "@/lib/crm/projektaiListPayload";
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
  searchParams: Promise<{ status?: string | string[]; q?: string | string[] }>;
}) {
  const perfT0 = Date.now();
  const sp = await searchParams;
  const statusRaw = typeof sp.status === "string" ? sp.status : undefined;
  const statusFilter = parseStatusFilter(statusRaw);
  const qTrim = typeof sp.q === "string" ? sp.q.trim() : "";
  const qLower = qTrim.toLowerCase();

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

  let rows: ProjectListRow[] = [];
  let userById = new Map<string, CrmUser>();
  let ownerColumnAvailable = true;
  let deletedAtAvailable = true;
  let sortOrderAvailable = true;
  let error: { message: string } | null = null;

  let loadPath: "rpc" | "legacy" = "legacy";
  let rpcProjektaiPayloadMs: number | undefined;
  let parseMs: number | undefined;
  let perfUsersMs = 0;
  let perfProjectsSelectMs = 0;
  let perfWorkItemCountsMs = 0;
  let rpcFallbackReason: string | undefined;

  const rpcTry = await fetchProjektaiListPayload(supabase);
  if (rpcTry.ok) {
    loadPath = "rpc";
    rows = rpcTry.rows;
    userById = rpcTry.userById;
    rpcProjektaiPayloadMs = rpcTry.rpcProjektaiPayloadMs;
    parseMs = rpcTry.parseMs;
    ownerColumnAvailable = true;
    deletedAtAvailable = true;
    sortOrderAvailable = true;
  } else {
    rpcFallbackReason = rpcTry.error;
    rpcProjektaiPayloadMs = rpcTry.rpcProjektaiPayloadMs;
    parseMs = rpcTry.parseMs;

    const perfUsersStart = Date.now();
    const users = await fetchCrmUsers(supabase);
    perfUsersMs = Date.now() - perfUsersStart;
    userById = new Map(users.map((u) => [u.id, u]));

    let data: unknown = null;

    const deletedAtSelect = ",deleted_at";
    const withOwnerSelectBaseWithSort =
      "id,name,description,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at,sort_order,owner_user_id";
    const withoutOwnerSelectBaseWithSort =
      "id,name,description,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at,sort_order";

    const withOwnerSelectBaseNoSort =
      "id,name,description,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at,owner_user_id";
    const withoutOwnerSelectBaseNoSort =
      "id,name,description,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at";

    const withOwnerSelect = withOwnerSelectBaseWithSort + deletedAtSelect;
    const withoutOwnerSelect = withoutOwnerSelectBaseWithSort + deletedAtSelect;

    const withOwnerSelectNoSort = withOwnerSelectBaseNoSort + deletedAtSelect;
    const withoutOwnerSelectNoSort = withoutOwnerSelectBaseNoSort + deletedAtSelect;

    async function runWithSortOrder() {
      return supabase
        .from("projects")
        .select(withOwnerSelect)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
    }

    async function runWithoutSortOrder(selectClause: string) {
      return supabase.from("projects").select(selectClause).order("created_at", { ascending: false });
    }

    const perfProjectsStart = Date.now();
    let first = await runWithSortOrder();
    if (first.error) {
      const msg = String(first.error.message ?? "");
      const missingOwner =
        msg.includes("owner_user_id") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));
      const missingDeletedAt =
        msg.includes("deleted_at") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));
      const missingSortOrder =
        msg.includes("sort_order") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));

      if (missingSortOrder) {
        sortOrderAvailable = false;
        first = await runWithoutSortOrder(withOwnerSelectNoSort);
      }

      if (!first.error) {
        data = first.data;
      } else {
        if (missingOwner) {
          ownerColumnAvailable = false;
          const retry = sortOrderAvailable
            ? await supabase
                .from("projects")
                .select(withoutOwnerSelect)
                .order("sort_order", { ascending: true, nullsFirst: false })
                .order("created_at", { ascending: false })
            : await runWithoutSortOrder(withoutOwnerSelectNoSort);
          data = retry.data;
          error = retry.error ? { message: retry.error.message } : null;
        } else if (missingDeletedAt) {
          deletedAtAvailable = false;
          const retry = sortOrderAvailable
            ? await supabase
                .from("projects")
                .select(withOwnerSelectBaseWithSort)
                .order("sort_order", { ascending: true, nullsFirst: false })
                .order("created_at", { ascending: false })
            : await runWithoutSortOrder(withOwnerSelectBaseNoSort);
          data = retry.data;
          error = retry.error ? { message: retry.error.message } : null;
        } else {
          error = { message: first.error.message };
        }
      }
    } else {
      data = first.data;
    }

    perfProjectsSelectMs = Date.now() - perfProjectsStart;

    if (error) {
      return (
        <CrmTableContainer>
          <p className="text-sm text-red-600">Nepavyko įkelti: {error.message}</p>
          <p className="mt-2 text-xs text-gray-500">
            Pritaikykite migracijas{" "}
            <code className="rounded bg-gray-100 px-1">0014_projects_snapshot.sql</code>,{" "}
            <code className="rounded bg-gray-100 px-1">0015_project_campaign_work_items.sql</code> ir{" "}
            <code className="rounded bg-gray-100 px-1">0078_projects_sort_order.sql</code>.
          </p>
        </CrmTableContainer>
      );
    }

    rows = (data ?? []) as ProjectListRow[];
    const perfCountsStart = Date.now();
    const countAttach = await attachProjectWorkItemCounts(supabase, rows);
    perfWorkItemCountsMs = Date.now() - perfCountsStart;
    if (!countAttach.ok && process.env.NODE_ENV === "development") {
      console.warn("[projektai] attachProjectWorkItemCounts:", countAttach.error);
    }
  }

  if (process.env.CRM_PERF_LOG === "1") {
    const totalServerMs = Date.now() - perfT0;
    if (loadPath === "rpc") {
      console.info("[CRM perf] /projektai SSR", {
        loadPath,
        rpcProjektaiPayloadMs,
        parseMs,
        totalServerMs,
      });
    } else {
      console.info("[CRM perf] /projektai SSR", {
        loadPath,
        rpcProjektaiPayloadMs,
        parseMs,
        rpcFallbackReason,
        usersMs: perfUsersMs,
        projectsSelectMs: perfProjectsSelectMs,
        workItemCountsMs: perfWorkItemCountsMs,
        projectsQueryMs: perfProjectsSelectMs + perfWorkItemCountsMs,
        totalServerMs,
      });
    }
  }

  const activeCount = rows.filter((p) => p.status === "active").length;
  const archivedCount = rows.filter((p) => p.status === "archived").length;
  const deletedCount = rows.filter((p) => p.status === "deleted").length;

  const filteredRows = rows.filter((p) => {
    if (statusFilter === "deleted") return p.status === "deleted";
    if (statusFilter === "archived") return p.status === "archived";
    return p.status === "active";
  });

  const searchedRows =
    qLower.length === 0
      ? filteredRows
      : filteredRows.filter((p) => {
          const name = String(p.name ?? "").toLowerCase();
          const desc = String(p.description ?? "").toLowerCase();
          return name.includes(qLower) || desc.includes(qLower);
        });

  const kpi = {
    projectCount: searchedRows.length,
    totalWorkItems: searchedRows.reduce((s, p) => s + projectWorkItemCount(p), 0),
    assignedProjects: searchedRows.filter((p) => p.owner_user_id).length,
  };

  return (
    <ProjectsListHub
      rows={searchedRows}
      userById={userById}
      ownerColumnAvailable={ownerColumnAvailable}
      statusFilter={statusFilter}
      counts={{ active: activeCount, archived: archivedCount, deleted: deletedCount }}
      deletedAtAvailable={deletedAtAvailable}
      kpi={kpi}
      qTrim={qTrim}
    />
  );
}
