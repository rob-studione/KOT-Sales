"use client";

import Link from "next/link";

import { CandidatesPanel } from "@/components/crm/translator-search/CandidatesPanel";
import { JobHistoryPanel } from "@/components/crm/translator-search/JobHistoryPanel";
import { NewSearchForm } from "@/components/crm/translator-search/NewSearchForm";
import { CRM_UNDERLINE_TAB_NAV_CLASS, crmUnderlineTabClass } from "@/components/crm/crmUnderlineTabStyles";
import { TRANSLATOR_SEARCH_PAGE_PATH } from "@/lib/translatorSearch/pageTabs";
import type {
  TranslatorCandidateRow,
  TranslatorCandidateSourceRow,
  TranslatorSearchJobRow,
  TranslatorSearchPageTab,
} from "@/lib/translatorSearch/types";

const TABS: ReadonlyArray<{ slug: TranslatorSearchPageTab; label: string }> = [
  { slug: "nauja", label: "Nauja paieška" },
  { slug: "kandidatai", label: "Kandidatai" },
  { slug: "istorija", label: "Paieškos istorija" },
];

function buildTabHref(tab: TranslatorSearchPageTab): string {
  if (tab === "nauja") return TRANSLATOR_SEARCH_PAGE_PATH;
  return `${TRANSLATOR_SEARCH_PAGE_PATH}?tab=${tab}`;
}

export function TranslatorSearchPageClient({
  tab,
  isAdmin,
  jobs,
  candidates,
  loadError,
}: {
  tab: TranslatorSearchPageTab;
  isAdmin: boolean;
  jobs: TranslatorSearchJobRow[];
  candidates: Array<TranslatorCandidateRow & { sources: TranslatorCandidateSourceRow[] }>;
  loadError: string | null;
}) {
  return (
    <div>
      <nav className={`mt-6 ${CRM_UNDERLINE_TAB_NAV_CLASS}`} aria-label="Vertėjų paieškos skiltys">
        {TABS.map(({ slug, label }) => (
          <Link key={slug} href={buildTabHref(slug)} scroll={false} className={crmUnderlineTabClass(tab === slug)}>
            {label}
          </Link>
        ))}
      </nav>

      <section className="mt-8 pb-16">
        {tab === "nauja" ? <NewSearchForm isAdmin={isAdmin} /> : null}
        {tab === "kandidatai" ? (
          <CandidatesPanel candidates={candidates} isAdmin={isAdmin} loadError={loadError} />
        ) : null}
        {tab === "istorija" ? <JobHistoryPanel jobs={jobs} loadError={loadError} /> : null}
      </section>
    </div>
  );
}
