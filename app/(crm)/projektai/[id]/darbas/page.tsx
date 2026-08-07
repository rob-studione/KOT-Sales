import { ProjectDetailTabPage, type ProjectDetailTabPageSearchParams } from "@/app/(crm)/projektai/[id]/ProjectDetailTabPage";

export const dynamic = "force-dynamic";

export default async function ProjektasDarbasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ProjectDetailTabPageSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <ProjectDetailTabPage id={id} tab="darbas" searchParams={sp} />;
}
