# Vertėjų paieška — implementacijos planas (A–D)

Remiasi:

- `docs/translator-search/00-repo-audit-result.md`
- `docs/translator-search/01-mvp-spec.md`
- `AGENTS.md` (migracijos prieš deploy / SSR užklausas)
- dabartiniu `git status` (žr. §0) — audite minėti necommitinti failai **pasikeitė**; jų neliečiame

**Šis dokumentas dar nesuteikia leidimo keisti kodą.** Implementacija pradedama tik po plano patvirtinimo, fazėmis A → B → C → D.

---

## 0. Pradinė būsena ir ribos

| Laukas | Reikšmė |
|---|---|
| Branch / HEAD (šiame plane) | `main` @ `58cd155` |
| Leidžiama dabar | Tik šis failas (ir jau padėtas `01-mvp-spec.md`) |
| Draudžiama iki patvirtinimo | App kodas, migracijos taikymas, deps, deploy, commit/push |
| Lygiagretūs naudotojo pakeitimai (neliečiami) | Modified: `ProjectDetailTabPage.tsx`, kandidatų UI/lib failai, `analyticsDates.ts`, `projectActions.ts`, …; untracked: `docs/STUDIO_ONE_INVOICING_MODULE_SPEC.md`, `lib/crm/manualLeadCrmStatus.ts` |

Kiekviena fazė — atskiras vertikalus pjūvis su baigimo kriterijumi. Scope plėsti tik su nauju raštišku sprendimu (§15 MVP „sąmoningai ne“).

---

## 1. Repo faktai, kuriais remiasi planas

| Faktas | Įrodymas | Planavimo pasekmė |
|---|---|---|
| Įrankiai nav = `irankiaiChildren` | `components/crm/CrmSidebar.tsx` L69–72, L414 | Pridėti „Vertėjų paieška“ tarp Scenarijai ir Podcastai |
| Route group CRM | `app/(crm)/layout.tsx`, `app/(crm)/irankiai/podcastai/page.tsx` | Naujas `app/(crm)/irankiai/verteju-paieska/page.tsx` |
| Middleware saugo `/irankiai`, ne `/api` | `middleware.ts` L15, L27 | API patys tikrina sesiją + rolę |
| Roles `admin` \| `sales` | `lib/crm/roles.ts`; `getCurrentCrmUser` / `requireAdmin` | Be naujos permissions sistemos |
| Admin API patternas | `app/api/crm/yt-podcasts/refresh-insights/route.ts` L15–21 | `POST .../translator-search/run` kopijuoja 401/403 |
| Server actions patternas | `lib/crm/ytPodcastSettingsActions.ts` (`"use server"` + `requireAdmin`) | Review gali būti action arba siauras API |
| SSR skaitymas | `createSupabaseSsrReadOnlyClient` (`lib/supabase/ssr.ts`); Scenarijai page | Jobs/candidates list be atskiro read API |
| Admin rašymas | `createSupabaseAdminClient` (`lib/supabase/admin.ts`) | Po admin auth — service-role insert/update |
| OpenAI client + kill switch | `lib/openai/serverClient.ts`, `callGate.ts` | Privaloma pernaudoti |
| Structured Outputs jau naudojami | `client.responses.parse({ text: { format: … } })` YT/Lost QA | Extraction kelias = tas pats SDK helperis |
| `openai@6.34.0` turi `web_search` + `include: web_search_call.action.sources` | `node_modules/openai/resources/responses/responses.d.ts` (`WebSearchTool`, `ResponseIncludable`) | **Dependency upgrade MVP neprivalomas** API formai |
| Kainodara | `lib/openai/pricing.ts` (šiuo metu orientuota į `gpt-4o`) | Reikės modelio konstantos + EUR rates naujam modeliui |
| RLS authenticated SELECT | `0102_yt_podcast_tool.sql` L75–106 | Trims lentelėms tas pats patternas |
| Sekantis migracijos numeris | Paskutinė `0136_procurement_overview_by_organization.sql` | `0137_translator_search.sql` (ar kitas laisvas numeris diegimo metu) |
| Testų frameworko nėra | Nėra jest/vitest; yra `scripts/verify-*.mjs/cjs` | SSRF/dedupe/auth = Node verify scriptai + rankinė patikra |
| `maxDuration` | Tik `app/api/cron/lost-qa/route.ts` = 300 | Run route turi eksportuoti `maxDuration` (pradžioje 60–120; prireikus iki 300) |
| PDF/HTML libs | Nėra `package.json` | A/B be PDF dep; C — tik jei būtina |

---

## 2. Spec ↔ repo prieštaravimai / sprendimo taškai

| # | Situacija | Mažiausia korekcija |
|---|---|---|
| P1 | Spec siūlo modelį `gpt-5.6-luna`; repo dabar naudoja `gpt-4o` YT/Lost QA; `pricing.ts` neturi luna rates | Fazių B/C pradžioje: viena konstanta `TRANSLATOR_SEARCH_MODEL` (env override optional). **Prieš C pilną web_search** patvirtinti, kad modelis prieinamas KOT OpenAI projekte ir palaiko `web_search` + Structured Outputs. Jei luna neprieinama — pakeisti į vieną kitą Responses-compatible modelį su `web_search` (be fallback grandinės). |
| P2 | Spec reikalauja unit/integration testų; repo neturi test runnerio | Nenaudoti naujo test frameworko be atskiro sprendimo. Rašyti `scripts/verify-translator-search-*.mjs` pagal `verify-lost-qa-date-regex.mjs` stilių + rankinius checklist. |
| P3 | Spec: jokio naujo settings UI; audit minėjo optional `/nustatymai` | Laikytis **spec**: limitai `lib/translatorSearch/limits.ts` (hardcoded). Jokio settings page MVP. |
| P4 | `ai_usage_logs.type` check = `prepare\|analyze\|summary` | MVP **nesinaudoti** `ai_usage_logs`; skaitikliai/kaina — `translator_search_jobs` stulpeliai (kaip spec §8.1). |
| P5 | Spec: vienas requestas be queue; Vercel timeout nežinomas | A/B: mažas batch (1–3 URL). C: `maxDuration` + stop_reason `time_limit`; jei neužtenka — mažinti limitus, **ne** pridėti cron. |
| P6 | Spec §17 sako vienintelė išvestis = šis planas; `01-mvp-spec.md` turėjo atsirasti docs | `01-mvp-spec.md` nukopijuotas į `docs/translator-search/` kaip šio etapo dokumentacijos grandinės dalis. Kodo nekeista. |

---

## 3. Tikslinė failų architektūra (visoms fazėms)

```text
supabase/migrations/0137_translator_search.sql

app/(crm)/irankiai/verteju-paieska/page.tsx
components/crm/CrmSidebar.tsx                          # nav + icon
components/crm/translator-search/
  TranslatorSearchPageClient.tsx                       # tabai / skiltys
  NewSearchForm.tsx
  CandidatesPanel.tsx
  JobHistoryPanel.tsx
  CandidateDetail.tsx                                  # evidence / review

lib/translatorSearch/
  types.ts
  limits.ts
  validateRequest.ts
  dedupe.ts
  normalizeUrl.ts
  safeFetch.ts                                         # SSRF / MIME / size
  htmlToText.ts
  prefilterContacts.ts
  buildSearchQueries.ts                                # C
  openaiWebSearch.ts                                   # C
  openaiExtractCandidate.ts                            # B
  pdfText.ts                                           # C optional
  runJob.ts                                            # orchestration
  reviewCandidate.ts                                   # write path
  loadPageData.ts                                      # SSR queries
  pricing.ts                                           # arba extend lib/openai/pricing.ts

app/api/crm/translator-search/run/route.ts
# optional: app/api/crm/translator-search/review/route.ts
# ARBA lib/crm/translatorSearchActions.ts ("use server")

scripts/verify-translator-search-url-safety.mjs         # D
scripts/verify-translator-search-dedupe.mjs              # D
```

Nekurti: queue, Edge Functions, settings page, master `translators`, kelių providerių.

---

## Fazė A — DB ir CRM karkasas

### Tikslas

Navigacija + tuščias puslapis su 3 skiltimis + schema su RLS. **Jokių** OpenAI / fetch kvietimų.

### DB

Viena migracija `supabase/migrations/0137_translator_search.sql` (numerį patikrinti diegiant):

1. `translator_search_jobs` — id, `requested_by` → `crm_users(id)`, `title`/`summary` text, `request_params` jsonb, `status` check (`pending|running|completed|failed`), `stop_reason`, `warning`, `error_code`, `error_message`, usage counters (search/fetch/pdf/openai/tokens/cost_eur), timestamps.
2. `translator_candidates` — profesiniai laukai (§7), `dedupe_key` unique, review laukai (`pending|approved|rejected`), timestamps.
3. `translator_candidate_sources` — `candidate_id`, `job_id`, source tipas, URLs, title, snippet, `evidence` jsonb, `pdf_page`, `retrieved_at`; unique `(job_id, candidate_id, canonical_url)`.
4. Indeksai: jobs by `created_at desc`; candidates by `review_status`, `dedupe_key`; sources by `job_id`, `candidate_id`.
5. RLS: enable visoms; policies `authenticated` **SELECT only**; `GRANT SELECT`; rašymas per service role (be INSERT/UPDATE grant authenticated).
6. `anon` — jokių grantų.

**Netaikyti produkcijai** be atskiro leidimo. Lokaliai / staging: `scripts/run-sql.cjs` + `DATABASE_URL` (kaip kiti `db:apply:*`), pagal `AGENTS.md`.

### Failai

| Veiksmas | Failas |
|---|---|
| Keisti | `components/crm/CrmSidebar.tsx` — `irankiaiChildren` eilė: Scenarijai → **Vertėjų paieška** → Podcastai; `iconForHref` (pvz. `Languages` ar `Search` iš lucide) |
| Naujas | `app/(crm)/irankiai/verteju-paieska/page.tsx` — `dynamic = "force-dynamic"`, `getCurrentCrmUser`, `CrmTableContainer`, 3 skiltys empty states |
| Naujas | `components/crm/translator-search/*` minimalūs presentational komponentai |
| Naujas | `lib/translatorSearch/types.ts`, `limits.ts` (konstantos iš spec §10) |
| Naujas | migracija |

`middleware.ts` **keisti nereikia** (`/irankiai` jau protected).

### Priklausomybės

Naujų npm deps — **nėra**.

### Testai / patikra

- Login → sidebar mato „Vertėjų paieška“ virš Podcastai.
- `/irankiai/verteju-paieska` kraunasi `admin` ir `sales`.
- Po migracijos (non-prod): `select` veikia authenticated; insert per anon/authenticated client **failina**; service role insert OK (smoke SQL).
- `npm run lint` (jei failuoja dėl **kitų** uncommitted failų — atskirti).

### Baigimo kriterijus

Meniu + route + empty UI + migracijos failas paruoštas; RLS smoke non-prod OK.

### Sąmoningai paliekama B

Formos submit, API, OpenAI, fetch, review write.

### Rollback

Pašalinti nav įrašą + page; migraciją rollbackinti tik jei buvo taikyta non-prod (`drop table` trijų lentelių) — produkcijoje netaikyta = nieko.

---

## Fazė B — Rankinių URL vertikalus pjūvis

### Tikslas

End-to-end: admin paleidžia job su 1–3 seed HTTPS URL → saugus HTML fetch → structured extraction → kandidatas + source + evidence → istorija → approve/reject. **Be** `web_search` ir **be** PDF dep.

### Pipeline (B)

```text
validate → insert job pending → running
→ seed URLs only (skip web_search)
→ safeFetch + htmlToText
→ prefilterContacts
→ responses.parse extraction (be tools)
→ dedupe + upsert candidate/source
→ completed/failed + finally terminalizuoti
```

Jei seed URL tušti — B gali grąžinti validacijos klaidą arba `failed` su aiškiu kodu `seed_urls_required_until_phase_c` (produkto pasirinkimas implementuojant; C nuims šį apribojimą).

### Failai

| Failas | Paskirtis |
|---|---|
| `app/api/crm/translator-search/run/route.ts` | Admin-only POST; mirror `refresh-insights`; `maxDuration`; `finally` → terminal status |
| `lib/translatorSearch/validateRequest.ts` | Serverio validacija + clamp limitų (nepasitikėti UI) |
| `lib/translatorSearch/normalizeUrl.ts` + `safeFetch.ts` | SSRF, redirects, size, MIME `text/html` |
| `lib/translatorSearch/htmlToText.ts` | Minimalus script/style/tag strip (be cheerio, jei užtenka) |
| `lib/translatorSearch/prefilterContacts.ts` | Email/phone/keyword heuristika |
| `lib/translatorSearch/openaiExtractCandidate.ts` | `createOpenAIClient` + `responses.parse` + schema; prompt injection instrukcijos |
| `lib/translatorSearch/dedupe.ts` | Exact-match eilė iš spec §8.4; neliesti approved/rejected |
| `lib/translatorSearch/runJob.ts` | Orkestracija + skaitikliai + cost estimate |
| `lib/translatorSearch/reviewCandidate.ts` + action **arba** `.../review/route.ts` | Tik approved/rejected; `reviewed_by` iš sesijos |
| UI | Forma (seed URLs), running/partial/error, kandidatų sąrašas, evidence, review mygtukai tik admin |
| Optional | Pratęsti `lib/openai/pricing.ts` naujam modeliui / env |

### Auth / rašymas

1. `getCurrentCrmUser()` → nėra → 401; ne admin → 403.
2. Tik tada `createSupabaseAdminClient()` rašymams.
3. `requested_by` / `reviewed_by` **tik** iš sesijos.
4. UI hide ≠ auth; `sales` forma rodo paaiškinimą.

### Idempotency

- Dvigubas submit: jei yra `pending|running` job su tuo pačiu `requested_by` + hash(`request_params`) per trumpą langą — grąžinti esamą job ID (arba 409); nestarti antro aktyvaus.
- Review: pakartotas tas pats statusas — no-op OK.

### Priklausomybės

Naujų deps **nenumatyta**. Jei `htmlToText` pasirodys per silpnas — **sustoti** ir pasiūlyti vieną siaurą dep (pvz. linkedom), nepridėti tyliai.

Modelis: pradėti nuo spec orientyro; jei luna neprieinama extraction-only (be web_search) — galima laikinai naudoti `gpt-4o` **tik B**, dokumentuojant C perėjimą prie web_search-capable modelio (vis dar vienas konfigūruojamas modelis, be runtime routerio).

### Testai / patikra

- Admin: 1–2 vieši testiniai URL → pending kandidatas su source + evidence.
- Kill switch `OPENAI_API_CALLS_DISABLED` → job `failed`, be modelio kvietimo.
- `sales` POST run / review → 403.
- Dedupe: tas pats email antrą kartą → naujas source, review nepakeistas.
- Rankinis EN→NL Belgium scenarijus **su seed URL** (ne full search).

### Baigimo kriterijus

Pilnas kelias be automatinės paieškos: forma → job → kandidatas → approve/reject → refresh išlieka.

### Sąmoningai paliekama C

`web_search`, PDF, query planner, 20-kandidatų pilnas limito rinkinys.

### Rollback

Feature flag nėra — išjungti: pašalinti/paslėpti run mygtuką + env kill switch; lentelės lieka.

---

## Fazė C — Automatinė paieška ir tekstinis PDF

### Tikslas

OpenAI `web_search` (iki 3 calls) → URL sąrašas → esamas B fetch/extract kelias → optional tekstinis PDF → limitai / stop_reason / partial.

### Papildomas pipeline

```text
build ≤3 queries → responses.create with tools:[{type:"web_search"}],
  tool_choice required (arba web_search),
  include:["web_search_call.action.sources"]
→ collect/normalize/dedupe URLs (+ seed)
→ esamas safeFetch / extract
→ PDF branch (jei MIME application/pdf)
→ stop on target/cost/time/source limits
```

### Failai

| Failas | Paskirtis |
|---|---|
| `lib/translatorSearch/buildSearchQueries.ts` | ≤3 užklausos; optional vienas LLM call **arba** deterministiniai template’ai — be agent framework |
| `lib/translatorSearch/openaiWebSearch.ts` | SDK `responses.create` + sources parse |
| `lib/translatorSearch/pdfText.ts` | Tik jei reikia; žr. deps |
| `lib/translatorSearch/runJob.ts` | Įjungti search šaką; stop reasons |
| `lib/translatorSearch/limits.ts` | Pilnas §10 rinkinys |
| UI | Rodyti apskaičiuotą kainą, `stop_reason`, partial warning |

### Priklausomybės

| Dep | Kada |
|---|---|
| `openai` upgrade | **Tik jei** 6.34.0 praktikoje nepalaiko pasirinkto modelio/tool lauko — tada plane atnaujinti su diff ir priežastimi; dabar tipai **palaiko** |
| PDF text lib (viena, pvz. `pdf-parse`) | Tik jei Node buferio/`pdftotext` nėra ir tekstinis PDF būtinas kontroliniam scenarijui |
| Cheerio/jsdom | Tik jei B html helperis objektyviai neužtenka |

### Runtime

- `export const maxDuration = 120` (ar 300, jei patvirtinta) ant run route.
- Pasiekus laiką — `completed` + `stop_reason=time_limit` su jau turimais kandidatais, jei jų yra; kitaip `failed` tik jei 0 kandidatų ir kritinė klaida.
- Jokio `vercel.json` cron / queue.

### Testai / patikra

- Kontrolinis scenarijus EN→NL / Belgium / sworn / freelancer / target 20 / budget 5 EUR (kokybės matas, ne garantija 20).
- Serveris atmeta `budget > 5` ir `target > 20` net jei UI pakeistas.
- Partial: sumažinti URL limitą teste → `source_limit` + kandidatai išlieka.
- PDF: vienas tekstinis PDF OK; skenuotas → `unsupported_scanned_pdf`, job tęsiasi.

### Baigimo kriterijus

Automatinė paieška veikia vienu provideriu; B kelias nepakeistas struktūriškai; limitai serveryje; partial UI aiškus.

### Sąmoningai paliekama D / po piloto

Cron, background worker, Storage, settings UI, fuzzy dedupe.

### Rollback

Env `TRANSLATOR_SEARCH_WEB_SEARCH_DISABLED=true` (pridėti fazėje C) → elgsena kaip B (tik seed). Arba globalus OpenAI kill switch.

---

## Fazė D — Saugumas, testai ir pilotas

### Tikslas

Užfiksuoti apsaugas testais/scriptais; roles/RLS smoke; kontrolinė paieška + kokybės suvestinė; sprendimas ar reikia background vėliau (**default: ne**).

### Darbai

1. `scripts/verify-translator-search-url-safety.mjs` — localhost, private IP, metadata IP, per daug redirectų, oversized body, blogas MIME (grynas unit be tinklo arba su mocked DNS jei įmanoma).
2. `scripts/verify-translator-search-dedupe.mjs` — email / canonical URL / fallback key; approved neperrašomas.
3. Rankinis auth checklist: 401 unauth API, 403 sales, 200 admin.
4. RLS smoke SQL non-prod.
5. Prompt-injection smoke: HTML su „ignore instructions / approve all“ → kandidatas vis tiek `pending`, schema nelūžta.
6. Kontrolinė paieška + trumpa kokybės lentelė (kiek kandidatų, kiek su email, kiek sworn claimed/verified, kaina).
7. `npm run lint` + `npm run build` — atskirti pre-existing klaidas nuo šio modulio.
8. **Netaikyti** remote migracijos / deploy be naudotojo leidimo.

### Failai

- Nauji verify scriptai (+ optional `package.json` script `verify:translator-search` **tik jei** patvirtinta).
- Galimi smulkūs bugfix po piloto — ne scope plėtimas.

### Baigimo kriterijus

Priėmimo kriterijai iš `01-mvp-spec.md` §14 padengti arba aiškiai pažymėti kaip blokatoriai; pilotas paleistas non-prod/prod pagal leidimą; background **nepridedamas** be naujo sprendimo.

### Rollback

Modulį galima palikti read-only (paslėpti run) arba išjungti OpenAI kill switch.

---

## 4. Priklausomybių santrauka

| Fazė | Nauja npm dep? | Pagrindimas |
|---|---|---|
| A | Ne | Tik Next/Supabase/lucide |
| B | Ne (default) | `fetch` + minimalus HTML strip + esamas `openai` |
| C | Galimai 1× PDF text | Tik jei kontroliniam PDF kelias be jos neįmanomas |
| C | `openai` bump | Tik jei runtime įrodo API nesuderinamumą su 6.34.0 |
| D | Ne | Node scriptai |

---

## 5. Migracijos / RLS patikros checklist

Prieš bet kokį aplinkos naudojimą su naujomis lentelėmis:

1. Pritaikyti `0137_…` į tą aplinką (`run-sql.cjs` / SQL editor) — **AGENTS.md**.
2. Patikrinti: `authenticated` SELECT OK; INSERT kaip authenticated failina.
3. Service role insert job + candidate + source OK.
4. Unique `dedupe_key` ir `(job_id, candidate_id, canonical_url)` veikia.
5. Tik tada deployinti kodą, kuris `.from("translator_…")`.

---

## 6. Sustojimo taškai (gates)

| Po fazės | Gate klausimas | Jei NE |
|---|---|---|
| A | Nav + empty UI + migracija non-prod OK? | Nęsti B |
| B | Seed URL E2E + review + 403 sales? | Nęsti C; taisyti extraction/SSRF |
| C | web_search + limitai + partial; modelis prieinamas? | Sumažinti batch / keisti modelio konstantą; **ne** queue |
| D | §14 acceptance + pilotas? | Blokuoti prod naudojimą kontaktams; taisyti saugumą |

Papildomas gate prieš prod kontaktų naudojimą (spec §12): teisinis pagrindas — **produktinis**, ne kodo.

---

## 7. Siūloma implementacijos seka po patvirtinimo

1. Patvirtinti šį planą (+ P1 modelio pasirinkimą).
2. Atidaryti švarią branch nuo `main` (arba sutartą bazę); **nemaišyti** su esamais uncommitted sales/kandidatų pakeitimais.
3. A → review → B → review → C → review → D.
4. Migraciją ir deploy — tik su atskiru leidimu kiekvienai aplinkai.

---

## 8. Kas sąmoningai neįeina į jokią fazę

Viskas iš `01-mvp-spec.md` §15, įskaitant: cron/queue/Redis/vector DB, Playwright/OCR/Storage archyvą, master `translators`, kelių providerių, settings UI, masinį edit/merge/export, naują roles sistemą.

---

## 9. Plano atitiktis

| Reikalavimas | Statusas |
|---|---|
| A–D detalizuotos su failais, DB, deps, testais, baigimu, rollback | Taip |
| Remiasi tikrais repo simboliais | Taip |
| Prieštaravimai įvardyti be tylaus kodo keitimo | Taip (§2) |
| Implementacija / migracija / deploy šiame žingsnyje | Nevykdyta |
| Vienintelis naujas planavimo artefaktas | `docs/translator-search/02-implementation-plan.md` (`01-mvp-spec.md` — specifikacijos kopija į docs) |
