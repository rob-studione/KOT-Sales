# 01 – KOT Sales „Vertėjų paieška“ MVP specifikacija

## Dokumento paskirtis

Ši specifikacija parengta pagal:

- `docs/translator-search/00-repo-audit-result.md`;
- audite patvirtintą KOT Sales architektūrą, roles, Supabase modelį ir Vercel ribas;
- principą: sukurti gerą vidinį įrankį, bet nestatyti atskiros ar „enterprise“ platformos.

Šis dokumentas apibrėžia **ką turi daryti MVP** ir sąmoningai užfiksuoja neaiškių produkto klausimų pradinius sprendimus.

**Šis dokumentas pats savaime dar nesuteikia leidimo keisti kodą.** Kitas žingsnis – pagal jį sukurti `docs/translator-search/02-implementation-plan.md`. Tik po plano patvirtinimo pradedama implementacija mažomis fazėmis.

---

## 1. MVP tikslas

KOT Sales vartotojas turi galėti viename vidiniame modulyje:

1. aprašyti, kokių vertėjų ieško;
2. rankiniu būdu paleisti ribotą viešo interneto paiešką;
3. matyti paieškos eigą ir istoriją;
4. gauti struktūruotus kandidatų įrašus su konkrečiais šaltiniais ir įrodymų fragmentais;
5. peržiūrėti kandidatą;
6. rankiniu būdu jį patvirtinti arba atmesti.

MVP sėkmė nėra „nuscrapinti visą internetą“. Sėkmė – viena kontroliuojama paieška, kuri realiai suranda naudingų kandidatų, neviršija limitų ir neįrašo nepatikrintų žmonių kaip KOT vertėjų.

### Kontrolinis paieškos scenarijus

Pirmasis produkto kokybės bandymas:

```text
Kalba iš: English
Kalba į: Dutch
Šalis: Belgium
Sertifikavimas: Sworn / certified būtinas
Tipas: Freelancer
Tikslas: 20 kandidatų
Maksimalus biudžetas: 5 EUR
```

Šis scenarijus yra kokybės matas, o ne garantija, kad kiekviena paieška visada pateiks 20 tinkamų žmonių.

---

## 2. Užfiksuoti MVP sprendimai

| Klausimas | MVP sprendimas |
|---|---|
| Vieta KOT Sales | Vienas meniu punktas **„Vertėjų paieška“** po **„Įrankiai“**, route `/irankiai/verteju-paieska` |
| UI patternas | Pernaudoti „Podcastai“ ir `CrmTableContainer` patternus; nekurti atskiros aplikacijos |
| Kas mato modulį | Prisijungę `admin` ir `sales` |
| Kas paleidžia paiešką | Tik `admin` |
| Kas tvirtina / atmeta | Tik `admin` |
| `sales` teisės | Tik skaitymas |
| Paieškos provideris | Vienas: OpenAI Responses API `web_search`; nepridėti Google/Bing/Serp ar kito providerio MVP |
| LLM provideris | Tik OpenAI, per esamą serverio klientą |
| Modelių strategija | Vienas konfigūruojamas modelis, be runtime routing ar fallback grandinės |
| Vykdymas | Rankinis, ribotas serverio requestas; jokio cron, queue ar atskiro workerio MVP |
| HTML | Paprastas viešo puslapio HTTP fetch ir ribotas teksto išvalymas; jokio Playwright |
| PDF | Tik vieši, tekstiniai PDF; jokio OCR, vizualinio PDF analizavimo ar Storage bucket |
| Kandidato būsena | Visi automatiškai rasti kandidatai pradeda kaip `pending` |
| Patvirtintas kandidatas | Lieka `translator_candidates` su `approved` būsena; atskiros `translators` master lentelės šiame MVP nėra |
| DB | Trys siauros lentelės: jobs, candidates, candidate sources |
| Duomenų šaltiniai | Saugomas URL, pavadinimas, gavimo laikas ir trumpi laukų įrodymų fragmentai; visas HTML/PDF nesaugomas |
| Cost kontrolė | Fiksuoti serverio limitai + vartotojo nurodomas biudžetas iki 5 EUR; kaina rodoma kaip apskaičiuota, jei provideris negrąžina galutinės EUR sumos |
| Deploy | MVP implementacijos užduotis savaime neleidžia deployinti ar taikyti migracijos produkcijai |

### Kodėl paieška nėra tik rankinių URL analizė

Galutinis MVP turi pats atrasti viešus šaltinius pagal vartotojo kriterijus. Tačiau implementacija turi būti padalinta taip, kad pirmas veikiantis vertikalus pjūvis galėtų pradėti nuo 1–3 rankinių testinių URL. Automatinis OpenAI `web_search` prijungiamas atskira maža faze, neperrašant jau veikiančio kandidatų ištraukimo kelio.

---

## 3. Vartotojai ir prieigos kontrolė

### `admin`

Gali:

- atidaryti modulį ir matyti visas paieškas bei kandidatus;
- sukurti ir paleisti paiešką;
- peržiūrėti šaltinius bei įrodymus;
- pažymėti kandidatą `approved` arba `rejected`;
- pridėti trumpą peržiūros pastabą.

### `sales`

Gali:

- atidaryti modulį;
- matyti paieškų istoriją;
- matyti kandidatus, jų būsenas, šaltinius ir įrodymus.

Negali:

- paleisti paieškos;
- keisti kandidato būsenos;
- keisti limitų;
- kviesti vidinių write endpointų.

### Apsaugos patternas

- puslapį nuo neprisijungusių saugo esamas `/irankiai/*` middleware;
- API route'ai privalo patys tikrinti sesiją ir rolę, nes `/api/*` middleware nesaugo;
- write veiksmas: `getCurrentCrmUser` / esamas analogas → `admin` patikra → tik tada server-only Supabase admin klientas;
- `requested_by` ir `reviewed_by` imami tik iš patikrintos sesijos, niekada iš request body;
- vien paslėptas UI mygtukas nelaikomas autorizacija.

Nekurti naujos roles ar permissions sistemos.

---

## 4. Navigacija ir vieno puslapio struktūra

### Navigacija

`components/crm/CrmSidebar.tsx` masyve `irankiaiChildren` pridėti:

```text
Scenarijai
Vertėjų paieška
Podcastai
```

„Vertėjų paieška“ turi būti aukščiau „Podcastai“. Pridėti ikoną pagal esamą `iconForHref` patterną. Naujo top-level meniu, atskiro „Vertėjai“ CRM ar kelių sidebar punktų nereikia.

### Route

```text
/irankiai/verteju-paieska
```

Tikėtinas puslapis:

`app/(crm)/irankiai/verteju-paieska/page.tsx`

### Vidinės skiltys

Viename puslapyje turi būti trys aiškios skiltys arba tabai:

1. **Nauja paieška**
2. **Kandidatai**
3. **Paieškos istorija**

Nekurti trijų sidebar punktų. Atskirų route'ų kiekvienam tabui ir sudėtingos client-side routing sistemos nereikia, nebent esamas repo patternas aiškiai to reikalauja.

---

## 5. „Nauja paieška“

### Formos laukai

| Laukas | Privalomas | MVP taisyklė |
|---|---:|---|
| Kalba iš | Taip | Viena reikšmė, paprastas tekstas arba esamas select patternas |
| Kalba į | Taip | Viena reikšmė |
| Šalis | Taip | Paprastas tekstas / esamas šalių pasirinkimas, jei toks jau yra |
| Miestas | Ne | Paprastas tekstas |
| Sertifikavimas | Taip | `any` arba `required` |
| Specializacija | Ne | Viena tekstinė reikšmė |
| Kandidato tipas | Taip | `any`, `freelancer`, `agency` |
| Norimų kandidatų skaičius | Taip | Nuo 1 iki 20; default 20 |
| Maksimalus biudžetas EUR | Taip | Daugiau už 0, ne daugiau 5; default 5 |
| Pradiniai URL | Ne | Iki 3 viešų HTTPS URL testavimui ar prioritetiniams šaltiniams |

MVP nekurti atskirų `languages`, `countries`, `specializations` ar certifications lookup lentelių. Formos reikšmes normalizuoti serveryje ir laikyti kartu su nekintančia job parametrų kopija.

### Paleidimas

- „Paleisti paiešką“ mygtuką mato tik `admin`;
- forma validuojama ir kliente dėl UX, ir serveryje dėl saugumo;
- dvigubas paspaudimas neturi sukurti dviejų vienodų aktyvių job'ų;
- sukūrus job, vartotojas mato jo būseną ir gali pereiti prie dalinių ar galutinių rezultatų;
- `sales` šioje skiltyje mato paaiškinimą, kad paiešką gali paleisti administratorius.

---

## 6. Paieškos ir ištraukimo eiga

MVP pipeline:

```text
Admin forma
→ serverio validacija ir job įrašas
→ iki 3 siaurų paieškos užklausų
→ OpenAI Responses API web_search
→ pilnas šaltinių URL sąrašas
→ URL normalizavimas ir dedupe
→ ribotas viešo HTML / tekstinio PDF gavimas
→ kontaktų prefiltras kode
→ OpenAI Structured Outputs ištraukimas
→ kandidatų exact-match dedupe
→ kandidatas + source + evidence į DB
→ job completed arba failed
→ rankinė admin peržiūra
```

### 6.1. Paieškos užklausos

Sistema iš formos parengia ne daugiau kaip 3 tikslias užklausas. Bent viena gali būti tikslinei rinkai aktualia vietine formuluote. Tam galima naudoti tą patį vienintelį OpenAI modelį; atskiro „planner agento“ ar frameworko nereikia.

Pavyzdinės užklausų kryptys:

- profesija + kalbų pora + šalis;
- vietinis certified/sworn terminas + kalbų pora;
- `filetype:pdf` + profesija / sertifikavimas + šalis.

### 6.2. Web paieška

- naudoti OpenAI Responses API `web_search` kaip vienintelį providerį;
- kai paieška privaloma, konfigūruoti ją kaip privalomą, o ne palikti modeliui jos visai nekviesti;
- prašyti viso panaudotų šaltinių sąrašo ir saugoti tik tuos URL, kurie realiai pagrindžia kandidatą;
- nenaudoti `unlimited` paieškos režimo;
- nekurti recursion/discovery agento, kuris pats neribotai seka naujas nuorodas.

### 6.3. HTML

- tik viešas `http` / `https` turinys be prisijungimo;
- pirmenybė paprastam `fetch`;
- pašalinti `script`, `style`, navigacinį triukšmą ir HTML tagus minimaliu, testuojamu helperiu;
- siųsti modeliui tik ribotą aktualų tekstą;
- jokio Playwright, browser automation, CAPTCHA ar bot apsaugų apėjimo;
- jei puslapio negalima perskaityti paprastu fetch, jį praleisti ir užfiksuoti priežastį.

### 6.4. PDF

- tik viešas, tekstinis `application/pdf`;
- PDF apdorojamas laikinai atmintyje arba `/tmp`, bet nesaugomas Supabase Storage;
- ištraukiamas tik tekstas ir puslapio numeris, reikalingas įrodymui;
- leidžiama daugiausia viena siaura PDF teksto išgavimo dependency, tik jei standartinėmis repo priemonėmis to padaryti negalima;
- jokio OCR, viso PDF siuntimo vizualiniam modeliui ar skenuotų dokumentų analizės;
- jei PDF neturi ištraukiamo teksto, pažymėti `unsupported_scanned_pdf` ir tęsti kitus šaltinius.

### 6.5. Kandidato ištraukimas

Pirmas sluoksnis be LLM:

- email ir telefono kandidatai;
- URL bei domenas;
- akivaizdūs profesijos / kalbos raktažodžiai;
- tušti ar akivaizdžiai nereikšmingi tekstai atmetami prieš OpenAI kvietimą.

OpenAI sluoksnis:

- naudoja griežtą JSON Schema / Structured Outputs;
- grąžina tik schemoje apibrėžtus laukus;
- aiškiai atskiria `unknown` nuo `false`;
- jokio kontakto ar kalbų poros negali sukurti be šaltinio įrodymo;
- puslapio tekstą traktuoja kaip nepatikimus duomenis, o ne instrukcijas;
- automatiškai nieko nepatvirtina.

### 6.6. Dalinis rezultatas ir sustojimas

Job turi saugiai sustoti, kai:

- pasiektas norimas kandidatų skaičius;
- pasiektas search, URL, PDF, LLM ar apskaičiuotos kainos limitas;
- pasiektas saugus requesto laiko limitas;
- nebėra naujų tinkamų šaltinių.

Jei dalis šaltinių nepavyko, bet yra kandidatų, job gali baigtis `completed` su `stop_reason` ir trumpu perspėjimu. Vieno URL klaida neturi sugadinti visos paieškos.

---

## 7. Kandidato informacija ir įrodymai

### Kandidato laukai

MVP saugo tik profesinei atrankai reikalingus duomenis:

- rodomą vardą / pavadinimą;
- asmuo ar agentūra;
- profesinį el. paštą, jei rastas;
- telefoną, jei rastas;
- šalį ir miestą;
- vieną ar kelias tekste aiškiai patvirtintas kalbų poras;
- specializacijas, jei aiškiai nurodytos;
- `sworn` / certified būseną: `unknown`, `claimed`, `verified`, `not_found`;
- svetainę ar profesinio profilio URL;
- trumpą atitikties santrauką;
- review būseną: `pending`, `approved`, `rejected`;
- dedupe raktą;
- peržiūrėjusį vartotoją, laiką ir optional pastabą.

Nenaudoti vieno migloto „confidence 96 %“ kaip galutinio pagrindimo. Svarbiems laukams pateikti konkretų source ir trumpą evidence fragmentą.

### Šaltinio duomenys

Kiekvienas kandidatas privalo turėti bent vieną šaltinį:

- originalus URL;
- canonical URL;
- tipas: `web`, `pdf` arba `manual`;
- puslapio / dokumento pavadinimas;
- gavimo data;
- PDF puslapio numeris, kai aktualu;
- trumpi įrodymų fragmentai, susieti su kandidato laukais.

Nesaugoti viso HTML, PDF, paieškos rezultato teksto ar didelių LLM promptų.

---

## 8. Minimalus DB modelis

Naudoti tik tris naujas lenteles. Galutiniai SQL pavadinimai ir foreign keys turi sekti repo migracijų konvencijas; žemiau aprašyta semantika, ne paruoštas SQL.

### 8.1. `translator_search_jobs`

Paskirtis: viena vartotojo paleista paieška.

Būtinos laukų grupės:

- identifikatorius ir `requested_by` pagal esamą `crm_users` / auth patterną;
- žmogui matomas paieškos aprašas;
- nekintanti `request_params` kopija su kriterijais ir tuo metu galiojusiais limitais;
- būsena: `pending`, `running`, `completed`, `failed`;
- `stop_reason`, trumpas perspėjimas arba saugus klaidos tekstas;
- panaudojimo skaitikliai: search calls, fetch URL, PDF, OpenAI calls, tokenai ir apskaičiuota kaina, kiek praktiškai grąžina esamas klientas;
- `created_at`, `started_at`, `finished_at`.

Nereikia atskiros queue, attempts ar job events lentelės.

### 8.2. `translator_candidates`

Paskirtis: globalus rastų kandidatų sąrašas, nepririštas tik prie vienos paieškos.

Būtinos laukų grupės:

- profesiniai kandidato duomenys iš §7;
- `dedupe_key` exact-match deduplikacijai;
- review būsena ir review audit laukai;
- `created_at`, `updated_at`.

Patvirtintas kandidatas lieka čia. Šiame MVP nekurti atskiros kanoninės `translators` lentelės.

### 8.3. `translator_candidate_sources`

Paskirtis:

- susieti kandidatą su konkrečia paieškos užduotimi;
- išsaugoti provenance ir lauko įrodymus;
- leisti tam pačiam kandidatui atsirasti keliose paieškose jo nedubliuojant.

Būtinos laukų grupės:

- `candidate_id` ir `job_id`;
- source tipas, originalus bei canonical URL;
- pavadinimas, trumpas snippet ir ribotas field-level evidence JSON;
- PDF puslapis, kai aktualu;
- `retrieved_at`.

### 8.4. Deduplikacija

Konservatyvi exact-match tvarka:

1. normalizuotas el. paštas;
2. canonical profesinio profilio / asmeninės svetainės URL;
3. fallback: normalizuotas vardas + canonical source URL + šalis, jei turima.

MVP nenaudoti fuzzy matching, embeddings ar vector DB. Geriau palikti retą dublį žmogui peržiūrėti, nei automatiškai sujungti du skirtingus asmenis.

Pakartotinė paieška:

- gali pridėti naują source prie esamo kandidato;
- negali tyliai perrašyti `approved` / `rejected` būsenos į `pending`;
- negali perrašyti rankinio review laukų;
- tas pats job + kandidatas + canonical URL negali sukurti antro source įrašo.

### 8.5. RLS

- visoms trims lentelėms RLS įjungtas;
- `authenticated` gauna tik `SELECT`;
- `anon` negauna prieigos;
- `INSERT` / `UPDATE` vyksta tik per admin autorizuotą serverio endpointą ir service-role klientą;
- tiesioginio `DELETE` veiksmo MVP nėra.

Nekurti papildomų audit, review events, search queries, languages, specializations ar suppression lentelių šiame etape.

---

## 9. Minimalūs serverio veiksmai

### Paieškos paleidimas

Tikėtinas endpointas:

`POST /api/crm/translator-search/run`

Atsakomybės:

- sesija ir `admin` rolė;
- request validacija;
- serverio limitų pritaikymas nepriklausomai nuo UI;
- job sukūrimas ir būsenos valdymas;
- riboto pipeline paleidimas;
- saugus JSON atsakymas su job ID ir rezultato suvestine;
- klaidos atveju job visada užbaigiamas `failed`, su `finished_at`.

### Kandidato review

Vienas siauras server action arba endpointas kandidatui:

- leistinos būsenos tik `approved` arba `rejected`;
- sesija ir `admin` rolė;
- atnaujinami `reviewed_by`, `reviewed_at`, optional `review_note`;
- pakartotas toks pats veiksmas yra saugus;
- vartotojas negali keisti extracted laukų per šį endpointą.

### Skaitymas

Puslapis gali skaityti jobs ir candidates per esamą SSR read-only Supabase klientą. Nekurti API vien dėl to, ką saugiai ir aiškiai atlieka esamas RSC/SSR patternas.

Nekurti bendrinio repository frameworko, event bus ar universalios jobs abstrakcijos.

---

## 10. Pradiniai limitai

Tai konservatyvūs pirmojo piloto limitai. Vartotojui formoje rodomi tik kandidatų skaičius ir EUR biudžetas; techniniai limitai laikomi vienoje serverio konfigūracijos vietoje.

| Limitas | Pradinis dydis |
|---|---:|
| Norimi kandidatai | iki 20 |
| Maksimalus apskaičiuotas biudžetas | 5 EUR |
| Paieškos užklausos | iki 3 |
| OpenAI web search calls | iki 3 |
| Unikalūs source URL | iki 30 |
| Tiesiogiai fetch'inami URL | iki 20 |
| Puslapiai iš vieno domeno | iki 3 |
| PDF failai | iki 3 |
| Vieno PDF dydis | iki 10 MB |
| Bendras PDF puslapių skaičius | iki 30 |
| Modeliui siunčiamas vieno šaltinio tekstas | iki 40 000 ženklų |
| Modeliui siunčiamas bendras tekstas | iki 200 000 ženklų |
| OpenAI extraction calls | iki 10 |
| Transient retry | daugiausia 1 vienam veiksmui |

Jei Vercel runtime patvirtintas limitas mažesnis nei šis batch realiai reikalauja, pirmiausia mažinti batch ir tvarkingai grąžinti dalinį rezultatą. Nepridėti queue/cron/worker automatiškai.

Kainos suma yra apskaičiuojama pagal faktinius tokenų/tool call skaitiklius ir vienoje vietoje laikomą kainodarą. Ji UI turi būti žymima kaip **apskaičiuota**, o ne tapatinama su galutine tiekėjo sąskaita.

---

## 11. OpenAI integracijos ribos

- pernaudoti esamą `lib/openai/serverClient.ts` ir globalų `OPENAI_API_CALLS_DISABLED` kill switch;
- naudoti Responses API;
- vienas konfigūruojamas modelis turi palaikyti `web_search` ir Structured Outputs;
- dabartinis orientacinis ekonomiškas pasirinkimas – `gpt-5.6-luna`, jei jis prieinamas KOT OpenAI projekte ir suderinamas su repo SDK;
- nedaryti automatinio modelių routing, „stipresnio modelio fallback“, Batch API ar kelių provider abstractions;
- paieškos šaltinius gauti per `include: ["web_search_call.action.sources"]` arba dabartinį oficialų SDK atitikmenį;
- extraction rezultatui naudoti strict JSON Schema per Responses `text.format` arba oficialų esamos SDK versijos helperį;
- jei esama `openai` dependency versija nepalaiko pasirinkto API lauko, tai turi būti aiškiai įvertinta `02-implementation-plan.md`; dependency negalima tyliai atnaujinti be plano ir būtinybės pagrindimo.

Oficialios implementacijos nuorodos:

- [OpenAI Web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)
- [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 Luna modelio galimybės](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

---

## 12. Saugumas ir privatumas

### URL ir SSRF apsauga

Kiekvienam seed ar search-derived URL:

- leidžiami tik `http` ir `https`; formoje – tik `https`, jei nėra būtino pagrįsto atvejo;
- atmesti credentials URL, `localhost`, loopback, private, link-local, multicast, reserved ir cloud metadata adresus;
- tikrinti ne vien hostname tekstą, bet ir DNS rezultatą;
- po kiekvieno redirecto URL bei IP tikrinti iš naujo;
- riboti redirectų skaičių, atsakymo dydį ir laiką;
- tikrinti faktinį MIME tipą;
- nesiųsti KOT cookies, auth headerių ar kitų vidinių credentials;
- nepasitikėti vien `Content-Length` headeriu.

### Prompt injection ir išgalvoti duomenys

- web ir PDF tekstas yra nepatikimas išorinis turinys;
- modelio instrukcija turi aiškiai liepti ignoruoti šaltinyje esančias komandas;
- modelis tik ištraukia duomenis pagal schemą, nevaldo kitų įrankių;
- kandidatas visada `pending`;
- laukas be evidence paliekamas `null` / `unknown`, o ne atspėjamas;
- source fragmentas turi būti trumpas ir pakankamas žmogui patikrinti.

### Duomenų minimizavimas

- rinkti tik viešus profesinius duomenis, aktualius vertėjų atrankai;
- nesaugoti visų puslapių, PDF failų ar ilgų ištraukų;
- nerinkti prisijungimų, slaptažodžių, asmeninių socialinių paskyrų turinio ar jautrių kategorijų duomenų;
- nevykdyti automatinio outreach;
- neapeiti robots, CAPTCHA, paywall, login ar kitų prieigos ribų;
- prieš produkcinį kontaktų naudojimą KOT turi atskirai patvirtinti teisinį pagrindą, informavimo ir duomenų saugojimo terminus.

### Logai

- nerašyti API raktų, pilnų dokumentų ar pilnų promptų;
- klaidos tekste nerodyti vidinių stack trace ar secret reikšmių;
- kandidatų kontaktų nekartoti techniniuose loguose, jei to nereikia gedimui diagnozuoti.

---

## 13. Būsenos ir klaidų elgsena

### Job būsenos

```text
pending → running → completed
                  ↘ failed
```

- terminalinė būsena visada turi turėti `finished_at`;
- `completed` gali turėti `stop_reason`, pvz. `target_reached`, `cost_limit`, `time_limit`, `source_limit`, `no_more_sources`;
- `failed` saugo trumpą saugų klaidos kodą ir žmogui suprantamą pranešimą;
- job negali neribotai likti `running`; requesto `finally` kelias turi jį terminalizuoti, kiek tai įmanoma;
- kelių URL nesėkmės pateikiamos suvestinėje, bet nebūtinai paverčia visą job `failed`.

### UI būsenos

Privalomos:

- tuščia istorija;
- vykdoma paieška;
- paieška baigta be kandidatų;
- dalinis rezultatas dėl limito;
- visiška klaida;
- OpenAI kill switch įjungtas;
- kandidatas be email, bet su kitu aiškiu profesiniu įrodymu;
- approve / reject vyksta ir baigtas.

---

## 14. Priėmimo kriterijai

### Navigacija ir UI

- „Vertėjų paieška“ rodoma po „Įrankiai“, aukščiau „Podcastai“;
- route `/irankiai/verteju-paieska` veikia prisijungus;
- puslapis naudoja esamą CRM shell ir vizualiai dera su artimiausiais moduliais;
- viename puslapyje prieinamos Nauja paieška, Kandidatai ir Paieškos istorija;
- yra aiškios loading, empty, partial ir error būsenos.

### Auth

- neprisijungęs vartotojas puslapio nepasiekia;
- `sales` gali skaityti, bet run ir review write veiksmai grąžina `403`;
- `admin` gali paleisti ir review'inti;
- API nepasitiki role iš kliento payload;
- tiesioginis endpointo kvietimas apeinant UI nesuteikia papildomų teisių.

### Duomenys

- yra tik trys naujos domain lentelės;
- RLS įjungtas, `authenticated` turi tik skaitymą;
- kandidatas be source ir evidence nesukuriamas;
- pakartotas tas pats job/source nekuria identiškų source įrašų;
- globalus exact-match dedupe neperrašo žmogaus review sprendimo;
- approved kandidatas neperkeliamas į neegzistuojančią master lentelę.

### Paieška

- admin gali atlikti kontrolinę EN → NL / Belgium / sworn paiešką;
- naudojamas vienas web search provideris ir vienas OpenAI modelis;
- rezultatuose rodomi tik vieši source URL;
- bent dalis tinkamų viešų HTML ir tekstinių PDF šaltinių gali būti apdorota be browser automation;
- sustojimo limitai taikomi serveryje ir jų negalima apeiti pakeitus UI requestą;
- pasiekus limitą išsaugomi jau rasti kandidatai ir aiški sustojimo priežastis;
- OpenAI kill switch atveju nėra modelio kvietimo ir job baigiamas aiškia klaida.

### Review

- kiekvienas kandidatas pradeda `pending`;
- admin gali `approve` arba `reject`;
- review sprendimas išlieka po refresh ir turi vartotoją bei laiką;
- pakartotas identiškas review requestas yra saugus;
- `sales` negali pakeisti review būsenos.

### Saugumas

- testai dengia localhost, private IP, DNS/redirect perėjimą į vidinį adresą, per didelį atsakymą ir netinkamą MIME;
- šaltinio instrukcijos negali pakeisti extraction schemos ar priversti modelio vykdyti kitų veiksmų;
- nenaudojamas login, CAPTCHA bypass, LinkedIn scraping, Playwright ar OCR;
- visas HTML/PDF turinys DB nesaugomas.

### Kokybė

- validacijos, URL saugos, dedupe ir būsenų perėjimų logika turi tikslinius testus pagal repo testavimo galimybes;
- API auth atvejai `401`, `403` ir sėkmingas admin kelias patikrinami;
- lint, typecheck ir build komandos, kurios repo jau laikomos autoritetingomis, turi praeiti arba turi būti aiškiai atskirtos iki užduoties egzistavusios klaidos;
- remote DB migracija ir deploy nevykdomi be atskiro naudotojo leidimo.

---

## 15. Sąmoningai ne MVP

- atskiras CRM ar top-level „Vertėjai“ modulis;
- kanoninė aktyvių KOT vertėjų master lentelė;
- automatinis kontaktavimas ar laiškų siuntimas;
- LinkedIn ar kitų prisijungimo reikalaujančių sistemų scrapingas;
- login automation, CAPTCHA ar bot apsaugų apėjimas;
- Playwright / headless browser;
- OCR ir vizualinis skenuotų PDF apdorojimas;
- PDF ar HTML archyvas Supabase Storage;
- pasikartojančios scheduled paieškos;
- cron, Redis, Kafka, queue, atskiras workeris ar microservice;
- keli search provideriai ar keli LLM provideriai;
- modelių routeris ir automatinis „stipresnio modelio“ fallback;
- vector DB, embeddings ar fuzzy dedupe;
- atskiros languages, countries, certifications ar specializations lentelės;
- review events, suppression list, search queries ar atskira cost logs lentelė;
- kandidatų redagavimo, merge, delete, outreach, eksportavimo ar masinių veiksmų UI;
- nauja settings UI, observability platforma ar bendrinis jobs frameworkas;
- plati analitika ir dashboardai.

Jei implementacijos metu paaiškėja, kad vieno iš šių elementų tikrai reikia, sustoti ir pateikti konkretų repo bei produkto įrodymą. Neplėsti scope tyliai.

---

## 16. Etapai, kuriuos turi detalizuoti `02-implementation-plan.md`

Planas turi skaidyti darbą į mažus patikrinamus vertikalius pjūvius:

### A. DB ir CRM karkasas

- viena migracija su 3 lentelėmis, RLS ir minimaliais indeksais;
- sidebar įrašas ir vienas puslapis;
- tuščios Nauja paieška / Kandidatai / Istorija būsenos;
- dar be išorinių API kvietimų.

### B. Rankinių URL vertikalus pjūvis

- admin paleidimas su 1–3 seed URL;
- saugus HTML fetch;
- vienas struktūruotas extraction kelias;
- kandidatas, source, evidence, history ir approve/reject;
- šis etapas turi veikti end-to-end prieš automatinę paiešką.

### C. Automatinė paieška ir tekstinis PDF

- OpenAI `web_search` su šaltinių sąrašu;
- automatinis atrastų URL apdorojimas;
- viena pagrįsta PDF text dependency, jei būtina;
- limitai, stop reasons ir partial results;
- jokio cron ar workerio.

### D. Saugumas, testai ir pilotas

- SSRF, redirect, MIME, dydžio, timeout ir prompt injection testai;
- roles/RLS smoke testai;
- kontrolinė paieška ir kokybės suvestinė;
- po piloto sprendžiama, ar apskritai reikia background vykdymo.

Kiekviena fazė turi turėti:

- tikslų failų sąrašą;
- DB pokyčius;
- priklausomybes ir jų pagrindimą;
- testus bei rankinę patikrą;
- aiškų baigimo kriterijų;
- ką sąmoningai palieka kitai fazei;
- saugų grįžimo kelią, jei fazė neveikia.

---

## 17. Užduotis kitam agentui

1. Perskaityk repo `AGENTS.md` ir vykdyk jo taisykles.
2. Perskaityk visą `docs/translator-search/00-repo-audit-result.md`.
3. Perskaityk visą šį `docs/translator-search/01-mvp-spec.md`.
4. Prieš veiksmus patikrink dabartinį `git status`; audite minėti necommitinti failai galėjo pasikeisti, todėl jų būsenos nelaikyk nekintančiu faktu.
5. Sukurk tik `docs/translator-search/02-implementation-plan.md`.
6. Plane remkis tikrais repo failais ir simboliais, o ne bendrine Next.js architektūra.
7. Detalizuok §16 A–D fazes, dependency poreikį, migracijos/RLS patikrą, testus ir sustojimo taškus.
8. Jei ši specifikacija prieštarauja dabartiniam repo faktui, nekeisk kodo ir nespręsk tyliai: plane aiškiai parodyk prieštaravimą bei mažiausią korekciją.

Šioje užduotyje draudžiama:

- keisti aplikacijos kodą ar konfigūraciją;
- kurti migraciją ar ją taikyti;
- diegti / atnaujinti dependencies;
- paleisti mutacines DB ar išorinių servisų operacijas;
- deployinti;
- commitinti, stage'inti ar push'inti.

Vienintelė leidžiama išvestis:

`docs/translator-search/02-implementation-plan.md`

Užduotis baigta tik kai planas yra pakankamai konkretus, kad kiekvieną A–D fazę būtų galima įgyvendinti atskirai, neplečiant šiame dokumente užfiksuoto MVP.
