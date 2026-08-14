import { TranslatorSearchPageClient } from "@/components/crm/translator-search/TranslatorSearchPageClient";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";
import { loadTranslatorSearchPageData } from "@/lib/translatorSearch/loadPageData";
import { parseTranslatorSearchTab } from "@/lib/translatorSearch/pageTabs";

export const dynamic = "force-dynamic";

export default async function VertejuPaieskaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const sp = await searchParams;
  const tab = parseTranslatorSearchTab(sp.tab);
  const crmUser = await getCurrentCrmUser();
  const canRun = hasPermission(crmUser, "tools.translator_search.run");
  const canReview = hasPermission(crmUser, "tools.translator_search.review");
  const data = await loadTranslatorSearchPageData();

  return (
    <CrmTableContainer className="py-10">
      <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6">
        <header className="border-b border-zinc-200/80 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Vertėjų paieška</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-600">
            Ribota viešų šaltinių paieška vertėjų kandidatams — su rankiniu patvirtinimu.
          </p>
          {data.schemaMissing ? (
            <p className="mt-3 text-sm text-amber-800">
              DB migracija 0137 dar nepritaikyta šioje aplinkoje — skaitymas/rašymas lauks atskiro leidimo.
            </p>
          ) : null}
        </header>

        <TranslatorSearchPageClient
          tab={tab}
          canRun={canRun}
          canReview={canReview}
          jobs={data.jobs}
          candidates={data.candidates}
          loadError={data.loadError}
        />
      </div>
    </CrmTableContainer>
  );
}
