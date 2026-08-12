# KOT Sales repo audito rezultatas: „Vertėjų paieška“

## 1. Audito apimtis ir read-only patvirtinimas

| Laukas | Reikšmė |
|---|---|
| Audito pradžia (UTC) | 2026-08-11T17:52:00Z (apytiksliai pagal sesiją) |
| Branch | `main` (sutampa su `origin/main`) |
| HEAD | `58cd15515a8ea679ed24b4f72235acbe3185b12c` — *Treat procurement outreach as one institution, not one contract.* |
| Pradinė `git status` | Tik naudotojo untracked: `docs/STUDIO_ONE_INVOICING_MODULE_SPEC.md`. Working tree be staged pakeitimų. |
| Užduoties šaltinis | `/Users/robertas/Downloads/00-repo-audit.md` |
| Leidžiamas artefaktas | Tik `docs/translator-search/00-repo-audit-result.md` |
| Produkcijos DB / PII | Neskaityta |
| Dependencies / migracijos / deploy | Nevykdyta |

Šis dokumentas yra **tik read-only auditas**. Implementacijos, SQL, dependency ar infrastruktūros pakeitimų nėra.

---

## 2. Trumpa išvada

1. **Kur prijungti po „Įrankiai“?** Į `components/crm/CrmSidebar.tsx` masyvą `irankiaiChildren` (dabar: Scenarijai + Podcastai) ir naują App Router puslapį `app/(crm)/irankiai/verteju-paieska/page.tsx`. Middleware jau saugo `/irankiai/*` sesija.
2. **Koks UI/route patternas?** Artimiausias AI įrankio šablonas — **Podcastai** (`/irankiai/podcastai`): RSC puslapis + `CrmTableContainer` + admin-only paleidimo mygtukas + optional admin nustatymai `/nustatymai/...`. Paprasčiausio ne-AI įrankio analogas — **Scenarijai**.
3. **Roles / apsauga?** Roles: `admin` \| `sales` (`crm_users`). Įrankių skiltis prieinama bet kuriam prisijungusiam. Pernaudoti: middleware sesija; UI `adminOnly` / `getCurrentCrmUser`; API `role !== "admin" → 403`; serveriui — `requireAdmin` nustatymams; background rašymams — `CRON_SECRET` + `createSupabaseAdminClient`.
4. **Esami DB modeliai vertėjams?** **Nėra** `translators` / `vendors` / `contacts` / language-pairs / skills katalogų. `companies` = klientai (sąskaitos); `project_procurement_contracts.supplier` = pirkimų string; `project_manual_leads.contact_name` = projekto lead kontaktas. Schema egzistuoja šioms lentelėms, **įrašų buvimas nepatikrintas**.
5. **Ar reikia naujų lentelių MVP?** **Taip** — esama schema netinka kandidatų katalogui. Absoliutus minimumas: **2–3 siauros lentelės** (paieškos darbas, kandidatas, optional šaltinis/provenance). Be jų neįmanoma saugoti rankinio patvirtinimo ir šaltinių.
6. **Paprasčiausias vykdymas?** MVP pradžiai — **rankinis admin POST** pagal `POST /api/crm/yt-podcasts/refresh-insights` (sesija + admin). Ilgesniam batch vėliau — tas pats patternas kaip `app/api/internal/yt-podcasts/*` su `assertCronOrInternalSecret`.
7. **Svarbiausios runtime ribos?** Hostingas Vercel (`fra1`); vienintelis `vercel.json` cron — Neksar; dokumentuotas `maxDuration = 300` tik Lost QA cron; HTML/PDF bibliotekų **nėra**; OpenAI jau yra; išorinio web search / crawl **nėra**.
8. **Mažiausias vėlesnis failų rinkinys?** Sidebar + middleware (jau dengia) + 1 page + UI komponentai + optional API + 1 migracija + `lib/...` paieškos logika. Be Redis/queue/vector DB.
9. **Kas nepatvirtinta?** Realūs produkcijos duomenys; Vercel plano timeout/memory ribos (repo nerašo skaičių, išskyrus Lost QA `300`); ar vertėjų katalogas turėtų būti atskiras nuo sales `companies`; kokį išorinį search API (jei bet kokį) rinktųsi produktas.

---

## 3. Repo architektūros santrauka

| Statusas | Radinys | Repo įrodymas | Reikšmė moduliui |
|---|---|---|---|
| **Patvirtinta** | Vienos aplikacijos Next.js repo (ne monorepo) | `package.json` L1–14 (`name: salex`, scripts `next dev/build`); katalogai `app/`, `components/`, `lib/`, `supabase/` | Modulis dedamas į tą pačią CRM aplikaciją |
| **Patvirtinta** | Stack: Next `16.2.2`, React `19.2.4`, TypeScript, Tailwind 4, npm (`package-lock.json`) | `package.json` L27–43 | Laikytis App Router + server components patternų |
| **Patvirtinta** | CRM UI po route group `app/(crm)/` + shell layout | `app/(crm)/layout.tsx` L9–11 | Naujas puslapis po `(crm)` |
| **Patvirtinta** | Domain logika `lib/crm`, `lib/ytPodcast`, `lib/openai`, `lib/supabase` | `lib/` katalogų sąrašas | Naują logiką dėti į `lib/` (pvz. `lib/translatorSearch/`), ne į page failus |
| **Patvirtinta** | DB schema = `supabase/migrations/` (~136 failų); nėra generated `database.types.ts` | Migracijų katalogas; `find` nerado `database.types.ts` | Tipai lokalūs / hand-written kaip kitur |
| **Patvirtinta** | Artimiausias AI įrankis: Podcastai | `app/(crm)/irankiai/podcastai/page.tsx`; `lib/ytPodcast/*`; `app/api/internal/yt-podcasts/*` | Kopijuoti struktūrą, ne inventoriaus inventorių |
| **Patvirtinta** | Antras Įrankių sibling: Scenarijai (playbooks) | `app/(crm)/scenarijai/page.tsx`; navigacija `CrmSidebar.tsx` L69–71 | Paprastesnis list/CRUD šablonas be background pipeline |
| **Nerasta / reikia patvirtinti** | Feature flags / i18n / breadcrumbs sistema | Paieška `featureFlag`, `next-intl`, `Breadcrumb` — be app-level sistemos | Meniu label hardcodinti LT kaip dabar |

---

## 4. „Įrankiai“ navigacija ir routing

| Statusas | Radinys | Repo įrodymas | Reikšmė moduliui |
|---|---|---|---|
| **Patvirtinta** | „Įrankiai“ = sidebar sekcija `id: "irankiai"`, ne atskiras index puslapis | `CrmSidebar.tsx` L35, L414 (`label: "Įrankiai"`, `children: irankiaiChildren`) | Naujas item = child link, ne nauja top-level sekcija |
| **Patvirtinta** | Vaikai: `/scenarijai`, `/irankiai/podcastai` | `CrmSidebar.tsx` L69–72 | Pridėti pvz. `{ href: "/irankiai/verteju-paieska", label: "Vertėjų paieška" }` |
| **Patvirtinta** | `/scenarijai` path mapinamas į sekciją „Įrankiai“ | `activeSectionForPath` L154–155 | Galima ir ne-`/irankiai` prefix, bet Podcastai patternas naudoja `/irankiai/...` |
| **Patvirtinta** | `irankiaiChildren` **ne** filtruojamas `adminOnly` | L414 vs L411/419 (`filterChildren` tik analitikai/nustatymams) | Visos roles matys meniu; apsaugą dėti server/API lygiu |
| **Patvirtinta** | Ikona per `iconForHref`; Podcastai → `Mic` | L119–130 | Pridėti ikoną naujam href |
| **Patvirtinta** | Route apsauga sesija: `/irankiai` protected | `middleware.ts` L27, L11–29 | Naujas `/irankiai/...` automatiškai protected |
| **Patvirtinta** | `/api/*` middleware **nesaugo** | `middleware.ts` L15 | API privalo turėti savo auth |
| **Išvada pagal įrodymus** | Minimalūs failai meniu + puslapiui | Sidebar + `app/(crm)/irankiai/verteju-paieska/page.tsx` (+ UI po `components/crm/...`) | Be i18n raktų / feature flag registrų |

**Atsakymas:** „Vertėjų paieška“ prijungiama **po „Įrankiai“** kaip `irankiaiChildren` įrašas ir App Router puslapis po `app/(crm)/irankiai/…`, pagal **Podcastai** patterną.

---

## 5. Auth, roles ir prieigos kontrolė

| Statusas | Radinys | Repo įrodymas | Reikšmė moduliui |
|---|---|---|---|
| **Patvirtinta** | Sesija: Supabase Auth cookies per middleware `getUser()` | `middleware.ts` L50–78 | Pakanka prisijungimo CRM UI |
| **Patvirtinta** | Roles tik `admin` \| `sales` | `lib/crm/roles.ts` L1–12; migracija `0026_crm_users_roles.sql` | Naujos roles sistemos nereikia |
| **Patvirtinta** | Dabartinis user: `crm_users` pagal `auth.uid()` | `lib/crm/currentUser.ts` `getCurrentCrmUser` L21–49 | Pernaudoti visur |
| **Patvirtinta** | Admin helper: `requireAdmin({ mode: "redirect" \| "throw" })` | `currentUser.ts` L54–66 | Admin settings page |
| **Patvirtinta** | Layout ne role-gate'ina — tik perduoda user į shell | `app/(crm)/layout.tsx` L9–11; `CrmShellClient.tsx` L63 | UI hide ≠ auth |
| **Patvirtinta** | Podcastai: visi authenticated skaito; refresh tik admin | `podcastai/page.tsx` L18–19, L29; API `refresh-insights/route.ts` L15–21 | Rekomenduojamas MVP guard |
| **Patvirtinta** | Admin settings Podcastams: `requireAdmin` redirect | `nustatymai/podcastai-ai/page.tsx` L11 | Optional AI limitų UI |
| **Patvirtinta** | Background: `assertCronOrInternalSecret` / Vercel cron header | `lib/crm/lostQa/gmailInternalAuth.ts` L12–48 | Jei reikia batch be browserio |
| **Patvirtinta** | RLS admin-read patternas (pvz. AI logs) | `0067_ai_usage_logs.sql` L30–35 | Rašymams dažnai service_role; skaitymui authenticated arba admin |

**Kas gali „Įrankiai“?** Bet kuris authenticated CRM user (middleware + ne-`adminOnly` children). Serverio/API apsauga admin veiksmams — atskirai, kaip Podcastai.

---

## 6. Supabase ir DB modelis

### Klientai

| Klientas | Failas | Paskirtis |
|---|---|---|
| Browser | `lib/supabase/browser.ts` `createSupabaseBrowserClient` | Client components |
| SSR | `lib/supabase/ssr.ts` `getSsrAuth`, `createSupabaseSsrClient`, `createSupabaseSsrReadOnlyClient` | RSC / actions |
| Server anon | `lib/supabase/server.ts` | Be cookies |
| Admin service role | `lib/supabase/admin.ts` `createSupabaseAdminClient` | Cron / pipeline rašymai |

### Schema šaltinis

- Autoritetinga: `supabase/migrations/` (taikoma per `scripts/run-sql.cjs` + `DATABASE_URL`, žr. `package.json` scripts ir `.env.example`).
- Generated tipų failo **nėra** → neatitikimų su types generacija **nepatikrinta** (nėra ko lyginti).
- Storage: bucket `crm-avatars` (`0029_storage_crm_avatars.sql`); PDF/document bucket **nerastas**.
- Edge Functions katalogo **nėra**.

### Vertėjams / sourcing relevantūs radiniai

| Statusas | Radinys | Repo įrodymas | Reikšmė moduliui |
|---|---|---|---|
| **Patvirtinta** | `companies` / `invoices` = klientų master | `0001_companies_invoices.sql` | Ne vertėjų katalogas |
| **Patvirtinta** | `project_manual_leads` turi `contact_name`, email, phone | `0034_project_manual_leads.sql` L3–12 | Lead kontaktas projekte, ne translator directory |
| **Patvirtinta** | `project_procurement_contracts.supplier` text | `0054_...sql` L18–27 | Pirkimų tiekėjo string, ne vendor entity |
| **Patvirtinta** | `yt_transcripts.language` = transcript meta | `0102_yt_podcast_tool.sql` L38–45 | Ne kalbų porų katalogas |
| **Patvirtinta** | `crm_users` = vidiniai darbuotojai | `0025_accounts_auth.sql` | Ne vertėjai |
| **Nerasta** | `translators`, `vendors`, `contacts`, `people`, `skills`, `language_pairs` lentelės | `create table` per migracijas — tokių pavadinimų nėra | MVP reikia naujos schemos dalies |
| **Patvirtinta** | YT RLS: authenticated SELECT; rašymas service_role | `0102` L75–106 | Geras patternas „feed skaito visi, pipeline rašo admin client“ |
| **Patvirtinta** | Manual leads RLS: authenticated CRUD | `0034` L18–36 | Jei kandidatus tvirtina sales role — panašus patternas |

**Išvada:** MVP **negalima** realizuoti vien pernaudojant esamą schemą kaip vertėjų katalogą. Reikia siauro naujo modelio (žr. §13).

---

## 7. Esami vertėjų / vendor / contact duomenys

| Sąvoka repo | Semantika | Tinka „Vertėjų paieškai“? |
|---|---|---|
| `companies` | Klientai pagal sąskaitas | Ne kaip translator master |
| `project_manual_leads` | Rankiniai projekto lead'ai + `contact_name` | Tik silpnas UI analogas kontaktų laukams |
| `project_procurement_contracts.supplier` | Viešųjų pirkimų tiekėjas (text) | Ne |
| `project_work_items` / kandidatai | Sales outreach kandidatai įmonėms | Workflow analogas (sąrašas, statusai), ne žmonių katalogas |
| `crm_users` | Vidiniai useriai | Ne |

**Deduplikacijai šiandien:** nėra email/URL unikalumo taisyklės vertėjams — teks projektuoti naujai (pvz. email + website + source URL).

**Import / patvirtinimo workflow:** Lost QA turi `lost_manager_reviews`; projektai turi kandidatų statusus / exclusions — tai **UI analogai rankiniam review**, ne duomenų šaltinis vertėjams.

**Duomenų buvimas produkcijoje:** schema egzistuoja minėtoms lentelėms; **įrašų buvimas nepatikrintas**.

---

## 8. Esamos paieškos, LLM, HTML ir PDF galimybės

| Statusas | Radinys | Repo įrodymas | Reikšmė moduliui |
|---|---|---|---|
| **Patvirtinta** | OpenAI SDK + server client | `package.json` L28; `lib/openai/serverClient.ts` L6–20 | Vienas LLM tiekėjas jau yra |
| **Patvirtinta** | Global kill switch `OPENAI_API_CALLS_DISABLED` | `.env.example` L45–46; `lib/openai/callGate.ts` (naudojamas serverClient) | Saugus default išjungimui |
| **Patvirtinta** | AI usage logs + YT cost limitai `crm_settings` | `0067_ai_usage_logs.sql`; `lib/ytPodcast/settings.ts` L5–29 (30 EUR/mo default) | Pernaudoti cost accounting idėją |
| **Patvirtinta** | OpenAI naudojamas Lost QA, YT, playbooks generate | API/lib keliai audito metu | Patternas: server-only helperiai |
| **Nerasta** | Serp/Bing/Google Search / Firecrawl / generic crawler | Priklausomybių ir kodo paieška | Išorinė paieška — spraga |
| **Nerasta** | cheerio/jsdom/PDF parser deps | `package.json` dependencies | HTML/PDF — spraga |
| **Patvirtinta** | Lengvas XML/RSS regex parse | `lib/ytPodcast/rss.ts` | Tik RSS, ne HTML |
| **Patvirtinta** | yt-dlp subprocess transcriptams | YT pipeline (`process-transcripts`) | Specifinis YouTube, ne general PDF |
| **Išvada** | Playwright tik transitive lockfile, ne app crawl dependency | `package-lock` / ne `package.json` deps | Nenaudoti kaip „turime crawlerį“ |

**MVP pasekmė:** LLM sluoksnis pernaudoti; web/PDF extraction ir search — naujas darbas (arba sąmoningai rankinis URL įvedimas be crawl).

---

## 9. Background execution galimybės

| Statusas | Radinys | Repo įrodymas | Reikšmė moduliui |
|---|---|---|---|
| **Patvirtinta** | Vercel cron: tik `/api/cron/sync-neksar` kas 15 min, region `fra1` | `vercel.json` L1–8 | Naujo cron automatiškai nedėti be poreikio |
| **Patvirtinta** | Kiti cron route'ai egzistuoja (lost-qa, procurement) | `app/api/cron/*` | Gali būti kviečiami išoriniu scheduleriu + secret |
| **Patvirtinta** | YT internal pipeline routes | `app/api/internal/yt-podcasts/{sync-rss,process-transcripts,analyze,weekly-summary}` | Batch + secret patternas |
| **Patvirtinta** | Rankinis admin triggeris | `app/api/crm/yt-podcasts/refresh-insights/route.ts` | **MVP #1 pasirinkimas** |
| **Patvirtinta** | State machine + attempts (YT) | `lib/ytPodcast` analyze failure po 3 bandymų (explore įrodymai) | Jei batch — kopijuoti statusų modelį |
| **Patvirtinta** | `maxDuration = 300` tik Lost QA | `app/api/cron/lost-qa/route.ts` L8 | Ilgiems job'ams reikia sąmoningo limito; Vercel plano riba **nepatvirtinta skaičiumi repo** |
| **Nerasta** | Redis / queue worker / Supabase Edge Functions | Nėra `supabase/functions`; nėra queue deps | Nesiūlyti |

**Vienas paprasčiausias pasirinkimas:** MVP = **rankinis paleidimas** (admin POST / page action) sinchroniškai arba trumpam batch; background cron — tik jei timeout/runtime priverčia.

---

## 10. Deployment ir runtime ribos

| Statusas | Radinys | Repo įrodymas | Reikšmė moduliui |
|---|---|---|---|
| **Patvirtinta** | Deploy: Vercel | `vercel.json`; README „Deploy on Vercel“ | Serverless/Node runtime |
| **Nerasta** | Pin'intas Node (`engines` / `.nvmrc`) | `package.json` neturi `engines`; yra `@types/node` ^20 | **Išvada:** Node 20 klasė tikėtina, nepatvirtinta |
| **Patvirtinta** | Migracijos: SQL failai + `scripts/run-sql.cjs` + `DATABASE_URL` | `.env.example` L16–21; npm `db:apply:*` | Naują schemą — migracijos failas, taikyti prieš deploy (AGENTS.md taisyklė) |
| **Patvirtinta** | Env vardai (be reikšmių) | `.env.example` — žr. sąrašą žemiau | Naujiems secret'ams vėliau pridėti analogiškai |
| **Nerasta / reikia patvirtinti** | Memory / FS / outbound fetch limitai skaičiais | Repo nerašo bendrų Vercel limitų | Dizaine vengti ilgų crawl grandinių be batch |
| **Išvada** | Išorinių HTML/PDF fetch realistiškumas | Priklauso nuo Vercel outbound + timeout; repo neturi PDF lib | MVP saugiau: mažai URL, rankinis start, statusų lentelė |

### Env vardai iš `.env.example` (tik pavadinimai)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_BUILD_DATE`, `NEXT_PUBLIC_COMMIT_HASH`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_SERVICE_ACCOUNT_JSON`, `LOST_QA_COMPANY_EMAIL_DOMAINS`, `GMAIL_PUBSUB_AUDIENCE`, `GMAIL_LOST_LABEL`, `CRON_SECRET`, `OPENAI_API_KEY`, `OPENAI_API_CALLS_DISABLED`, `LOST_QA_PIPELINE_ENABLED`, `LOST_QA_*` batch knobs, `OPENAI_PRICE_EUR_PER_1M_GPT_4O`.

**Pastaba (Išvada):** kode gali būti ir kitų vardų (pvz. Neksar, `YT_DLP_PATH`) — jie ne visi `.env.example`.

### CI

`.github/` egzistuoja; vėlesnei implementacijai aktualu bent `npm run lint` / build. Detalių workflow failų šis auditas neexpandino — **reikia patvirtinti** prieš CI planą.

---

## 11. Pernaudojami patternai

1. **Sidebar vaikų registracija** — `irankiaiChildren` + `iconForHref` (`CrmSidebar.tsx`).
2. **CRM page shell** — `CrmTableContainer` + `dynamic = "force-dynamic"` (Podcastai / Scenarijai).
3. **Auth stack** — middleware sesija + `getCurrentCrmUser` + optional `requireAdmin`.
4. **Admin API action** — `refresh-insights` stilius (401/403 JSON).
5. **Internal batch** — `assertCronOrInternalSecret` + `createSupabaseAdminClient`.
6. **Settings + cost caps** — `crm_settings` keys + `ai_usage_logs` (išplėsti `type` check tik jei reikia — dabar check ribotas `prepare|analyze|summary`).
7. **RLS** — authenticated read / service_role write (YT) arba authenticated CRUD (manual leads), priklausomai nuo to, ar sales tvirtina kandidatus.
8. **OpenAI** — `createOpenAIClient()` + env kill switch.
9. **CSV import UX** — `papaparse` jau deps; jei vėliau importuosite rankinius kandidatus.

---

## 12. Spragos, rizikos ir nežinomieji

| # | Tipas | Aprašymas |
|---|---|---|
| 1 | Spraga | Nėra translator/vendor katalogo schemos |
| 2 | Spraga | Nėra HTML/PDF extraction bibliotekų |
| 3 | Spraga | Nėra generic web search / crawl integracijos |
| 4 | Rizika | Ilgas multi-URL scrape serverless timeout'e (tik Lost QA turi `maxDuration=300`) |
| 5 | Rizika | `ai_usage_logs.type` check gali blokuoti naują usage tipą be migracijos |
| 6 | Rizika | Meniu hide ≠ auth; `/api` be middleware |
| 7 | Nežinoma | Produkcijos duomenų kiekis / ar yra išoriniai vertėjų šaltiniai |
| 8 | Nežinoma | Vercel plano tikslūs timeout/memory skaičiai |
| 9 | Nežinoma | Ar sales turi tvirtinti kandidatus, ar tik admin |
| 10 | Nežinoma | Ar reikia saugoti PDF blob storage, ar tik URL + extracted text |

---

## 13. Rekomenduojamas minimalus integracijos kelias

### MVP būtina

| Elementas | Pasirinkimas |
|---|---|
| Route / UI | `/irankiai/verteju-paieska` + įrašas `irankiaiChildren` |
| Patternas | Podcastai: RSC feed/list + admin „Paleisti“ |
| Roles | Skaitymas: authenticated (`sales`+`admin`); paleidimas / tvirtinimas write: pradžiai **admin** (kaip refresh-insights), nebent produktas nurodys kitaip |
| Esamos lentelės | OpenAI/settings/usage idėjos; **ne** companies kaip translator master |
| Naujos lentelės | **Minimum 2:** (1) `translator_search_jobs` (status, query params, limits, error), (2) `translator_candidates` (laukai + `status`: pending/approved/rejected + dedupe keys). **Optional 3-ia:** `translator_candidate_sources` (url, title, snippet) — jei nenorite JSONB šaltinių kandidato eilutėje |
| Vykdymas | Rankinis admin POST (sinchroninis trumpas run **arba** job eilutė `pending` + tas pats requestas apdoroja N URL) |
| LLM | Esamas OpenAI client; griežti limitai (max results / max URLs / max EUR) per `crm_settings` arba hardcode MVP |
| Rankinis patvirtinimas | UI veiksmai approved/rejected ant kandidato — be auto-insert į „master“ be žmogaus |
| Limitai | Max kandidatų per job, max OpenAI calls, feature kill switch |

### Vėliau

- Cron/`vercel.json` schedule
- PDF storage bucket
- Sales role tvirtinimas
- Dedikuotas search API
- Platus crawl / queue

### Ko sąmoningai nedaryti

- Naujos auth/roles platformos — jau yra `admin`/`sales`
- Redis, Kafka, Kubernetes, atskiro queue serviso, vector DB, multi-agent frameworko
- Microservices / Edge Functions be poreikio (repo jų nenaudoja)
- Naujo observability stacko
- Pernaudojimo apsimetimo: `companies` / procurement `supplier` **nėra** vertėjų katalogas
- Dependency „dėl gražumo“, jei MVP startuoja nuo rankinių URL + LLM ekstrakcijos be HTML parserio (arba vieno minimalaus parserio vėliau, kai įrodytas poreikis)
- Automatinio cron į `vercel.json` kol rankinis paleidimas neįrodė vertės

---

## 14. Minimalus implementation planas

> Šiame etape **nevykdoma** — tik planas vėlesnei implementacijai.

| # | Žingsnis | Rezultatas | Tikėtini failai / pernaudojimas | DB? | Priklausomybės | Patikra | Žyma |
|---|---|---|---|---|---|---|---|
| 1 | Produktiniai MVP parametrai | Sutarta: kas paleidžia, kokie limitai, ar sales mato | — | Ne | — | Raštiškas OK | **MVP būtina** |
| 2 | Migracija: jobs + candidates (+ optional sources) | Lentelės + RLS + indeksai dedupe | `supabase/migrations/0xxx_translator_search.sql`; RLS kaip YT arba manual leads | **Taip** | 1 | `run-sql` / SQL editor; RLS smoke | **MVP būtina** |
| 3 | Nav + tuščias puslapis | Matoma po Įrankiai | `CrmSidebar.tsx`; `app/(crm)/irankiai/verteju-paieska/page.tsx`; `CrmTableContainer` | Ne | — | Login → meniu → page | **MVP būtina** |
| 4 | List UI + statusai | Jobs/kandidatų sąrašas, empty states | `components/crm/translator-search/*`; skaitymas per SSR client | Ne (naudoja 2) | 2–3 | UI su testiniais įrašais | **MVP būtina** |
| 5 | Rankinis paleidimas API | Admin sukuria job ir apdoroja ribotą batch | `app/api/crm/translator-search/run/route.ts` pagal `refresh-insights`; `lib/translatorSearch/*`; `createOpenAIClient` | Ne | 2–4 | 401/403/200; kill switch | **MVP būtina** |
| 6 | Rankinis patvirtinimas | Approve/reject kandidatą | Server action ar API + RLS | Galimai policy tweak | 4–5 | Statusas DB pasikeičia | **MVP būtina** |
| 7 | Limitai / settings | Cost/count caps | `crm_settings` keys; optional `/nustatymai/...` + `requireAdmin` | Galimai settings rows | 5 | Limit pasiektas → stop | **MVP būtina** (nustatymų UI gali būti minimalus) |
| 8 | AI usage tipų suderinamumas | Logai nesulūžta | `ai_usage_logs` type check migracija **jei** reikia naujo type | Galimai | 5 | Insert po call | **MVP būtina** tik jei loginsite |
| 9 | HTML/PDF / search provider | Automatinis šaltinių rinkimas | Nauja dep **tik įrodžius**; kol kas rankiniai URL | Ne | 5 | 1–2 URL happy path | **Vėliau** (nebent produktas reikalauja jau MVP) |
| 10 | Internal cron | Bežiūri batch | `app/api/internal/...` + `CRON_SECRET`; optional `vercel.json` | Ne | 5 stabilus | Secret auth + idempotent | **Vėliau** |

---

## 15. Failai, kuriuos greičiausiai reikės keisti vėliau

| Failas / kelias | Kodėl |
|---|---|
| `components/crm/CrmSidebar.tsx` | `irankiaiChildren` + ikona |
| `middleware.ts` | Tik jei path ne po `/irankiai` / `/scenarijai` (dabar dengia) |
| `app/(crm)/irankiai/verteju-paieska/page.tsx` | **naujas** UI entry |
| `components/crm/translator-search/*` | **nauji** UI |
| `lib/translatorSearch/*` | **nauja** domain logika |
| `app/api/crm/translator-search/*` | **nauji** authenticated admin endpoints |
| `supabase/migrations/0xxx_*.sql` | **nauja** schema |
| `lib/openai/serverClient.ts` | pernaudojamas, greičiausiai be keitimo |
| `lib/crm/currentUser.ts` / `roles.ts` | pernaudojami be keitimo |
| Optional: `app/(crm)/nustatymai/...` + sidebar `settingsChildren` | AI/limitų UI |
| Optional: `.env.example` | Nauji secret vardai (search API ir pan.) |
| Optional: `vercel.json` | Tik jei pridėsite cron |

---

## 16. Atviri klausimai

1. Ar paleidimą ir approve turi daryti tik `admin`, ar ir `sales`?
2. Ar MVP turi automatiškai ieškoti webe, ar užtenka rankinių URL + LLM struktūrinimo?
3. Ar patvirtintas kandidatas tampa atskiru „translator master“ įrašu, ar lieka tik `approved` statusas candidates lentelėje?
4. Kokios kalbų poros / specializacijos privalomos MVP laukų aibėje?
5. Ar reikia saugoti originalius PDF failus Storage, ar tik tekstą + URL?
6. Koks mėnesio EUR / max-results limitas priimtinas?
7. Ar `ai_usage_logs.type` check bus praplėstas, ar usage loginsite per `meta` esamu tipu?
8. Koks Vercel planas (timeout lubos) šiai aplinkai?

---

## 17. Galutinis read-only atitikties patikrinimas

| Patikra | Rezultatas |
|---|---|
| Pradinė būsena | `main` @ `58cd155…`; untracked tik `docs/STUDIO_ONE_INVOICING_MODULE_SPEC.md` |
| Šios užduoties rašymas | Sukurta/užpildyta **tik** `docs/translator-search/00-repo-audit-result.md` (katalogas `docs/translator-search/`) |
| Naudotojo failai | `docs/STUDIO_ONE_INVOICING_MODULE_SPEC.md` **nelietas** |
| Kodas / deps / lock / DB / migracijos / config / infra / deploy | **Ši užduotis jų nekeitė** |
| Commit / branch / push | **Nedaryta** |
| Produkcijos DB / PII / scraping / išoriniai search API | **Nenaudota** |
| Galutinė būsena (pastebėjimas) | Be šio artefakto working tree turi ir **kitus** necommitintus pakeitimus, atsiradusius lygiagrečiai / ne iš šio audito: `lib/crm/analyticsDates.ts`, `lib/crm/projectActions.ts` (modified) bei toliau untracked `docs/STUDIO_ONE_INVOICING_MODULE_SPEC.md`. Jų **nelietėme** ir „nesutvarkėme“. |

Audito užduotis pagal `00-repo-audit.md` baigimo kriterijus laikoma **įvykdyta**: visos sritys padengtos, išvados su repo keliais, MVP atskirtas nuo „vėliau“, be naujos infrastruktūros be būtinybės, vienintelis šios užduoties artefaktas — šis failas.
