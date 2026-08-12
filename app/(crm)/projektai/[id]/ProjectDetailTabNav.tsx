import {
  buildProjectDetailHref,
  type ProjectDetailTab,
} from "@/lib/crm/projectPageSearchParams";
import { CRM_UNDERLINE_TAB_NAV_CLASS } from "@/components/crm/crmUnderlineTabStyles";
import { ProjectDetailTabLink } from "@/app/(crm)/projektai/[id]/ProjectDetailTabLink";

/**
 * Server Component — tab `href` fiksuoti čia (ne client).
 * Client tik pažymi active tab pagal pathname.
 */
export function ProjectDetailTabNav({
  projectId,
  isProcurement,
}: {
  projectId: string;
  isProcurement: boolean;
}) {
  const hrefFor = (tab: ProjectDetailTab): string =>
    buildProjectDetailHref(projectId, {
      tab,
      ...(tab === "apzvalga" ? { period: "today" } : {}),
      ...(tab === "pajamos" ? { salesPeriod: "all_time" } : {}),
      ...(tab === "darbas" ? { view: "board" } : {}),
    });

  return (
    <div className={`mt-4 ${CRM_UNDERLINE_TAB_NAV_CLASS}`} role="tablist" aria-label="Projekto skydeliai">
      <ProjectDetailTabLink href={hrefFor("apzvalga")} tab="apzvalga">
        Apžvalga
      </ProjectDetailTabLink>
      {isProcurement ? (
        <>
          <ProjectDetailTabLink href={hrefFor("sutartys")} tab="sutartys">
            Sutartys
          </ProjectDetailTabLink>
          <ProjectDetailTabLink href={hrefFor("darbas")} tab="darbas">
            Darbas
          </ProjectDetailTabLink>
          <ProjectDetailTabLink href={hrefFor("kontaktuota")} tab="kontaktuota">
            Užbaigta
          </ProjectDetailTabLink>
        </>
      ) : (
        <>
          <ProjectDetailTabLink href={hrefFor("kandidatai")} tab="kandidatai">
            Kandidatai
          </ProjectDetailTabLink>
          <ProjectDetailTabLink href={hrefFor("darbas")} tab="darbas">
            Darbas
          </ProjectDetailTabLink>
          <ProjectDetailTabLink href={hrefFor("kontaktuota")} tab="kontaktuota">
            Užbaigta
          </ProjectDetailTabLink>
          <ProjectDetailTabLink href={hrefFor("pajamos")} tab="pajamos">
            Pajamos
          </ProjectDetailTabLink>
        </>
      )}
    </div>
  );
}
