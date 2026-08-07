import type { ReactNode } from "react";
import type { ProjectAnalyticsPeriod } from "@/lib/crm/projectAnalytics";
import {
  ProjectAnalyticsPeriodControls,
  type ProjectAnalyticsPeriodParamKeys,
} from "@/components/crm/project-analytics/ProjectAnalyticsPeriodControls";

const SALES_PERIOD_KEYS: ProjectAnalyticsPeriodParamKeys = {
  period: "salesPeriod",
  from: "salesFrom",
  to: "salesTo",
};

/** Atskiras pardavimų periodo kalendorius — server markup + client controls. */
export function ProjectOverviewSalesPeriodHeader({
  projectId,
  salesPeriod,
  rangeFrom,
  rangeTo,
  meta,
  tabSegment = "apzvalga",
  paramKeys = SALES_PERIOD_KEYS,
  heading = "Pardavimų laikotarpis",
}: {
  projectId: string;
  salesPeriod: ProjectAnalyticsPeriod;
  rangeFrom: string;
  rangeTo: string;
  /** Po kalendoriaus (pvz. klientai · datos) — toje pačioje dešinėje kolonoje. */
  meta?: ReactNode;
  tabSegment?: string;
  paramKeys?: ProjectAnalyticsPeriodParamKeys;
  heading?: string;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Pardavimai</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Pajamos skaičiuojamos pagal PVM sąskaitas po pirmo kontakto pasirinktame laikotarpyje (sąskaitos data vėlesnė nei kontakto
          diena).
        </p>
      </div>
      <div className="relative z-20 flex w-full flex-col items-stretch sm:w-auto sm:items-end lg:shrink-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{heading}</div>
        <div className="mt-3">
          <ProjectAnalyticsPeriodControls
            key={`sales-${tabSegment}-${rangeFrom}-${rangeTo}-${salesPeriod}`}
            projectId={projectId}
            activePeriod={salesPeriod}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            paramKeys={paramKeys}
            heading={heading}
            tabSegment={tabSegment}
          />
        </div>
        {meta ? <div className="mt-5 w-full sm:w-auto sm:max-w-sm sm:text-right">{meta}</div> : null}
      </div>
    </div>
  );
}
