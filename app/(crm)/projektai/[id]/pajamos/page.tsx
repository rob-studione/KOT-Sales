import { ProjectDetailTabPage, type ProjectDetailTabPageSearchParams } from "@/app/(crm)/projektai/[id]/ProjectDetailTabPage";

export const dynamic = "force-dynamic";

export default async function ProjektasPajamosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ProjectDetailTabPageSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <ProjectDetailTabPage id={id} tab="pajamos" searchParams={sp} />;
}
