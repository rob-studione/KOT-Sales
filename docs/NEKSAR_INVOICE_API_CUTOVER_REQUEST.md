# Neksar TMS → KOT Sales: ko dar reikia cutover’ui

**Data:** 2026-07-23  
**Kam:** Neksar / KOT Cloud komandos agentui  
**Iš:** KOT Sales (`salex`)  
**Tikslas:** gauti **vieną pilną atsakymą**, kad KOT Sales galėtų atjungti Sąskaita123 API ir prijungti Neksar External Client Invoices API be papildomų klausimų.

> Šis dokumentas yra savarankiškas. Agentui **nereikia** KOT Sales repozitorijos.  
> **Nesiųskite API raktų** šiame atsakyme — tik URL, laukus, pavyzdžius, taisykles.

---

## 1. Kontekstas (jau sutarta KOT Sales pusėje)

| Sprendimas | Reikšmė |
|---|---|
| Naujas šaltinis | Neksar TMS External API (`/api/external/v1/client-invoices`) |
| Senas šaltinis | Sąskaita123 — **nebeišrašome**, atjungsime po cutover |
| Istorinės sąskaitos KOT Sales DB | **Lieka kaip yra** — neperimportuojame visos istorijos iš Neksar |
| Sync kryptis | Tik **į priekį** nuo cutover momento (naujos / pakeistos) |
| Ką KOT Sales saugo | Tik **antraštę**: id, data, suma, numeris/serija, klientas (kodas, pavadinimas, PVM, kontaktai) |
| Ko KOT Sales **nesaugo** | PDF, eilutės, mokėjimo statusas, `publicToken` |
| Periodinis sync | Taip — poll kas ~15 min (kaip dabar), per `updatedSince` + puslapiavimas |
| Auth | `X-API-KEY` header (ne Bearer) |

Turime lokalų/dev aprašą (`neksar-invoices-api-roberto.md`). Jo **nepakanka** produkciniam cutover.

---

## 2. Ką jau žinome iš jūsų MD (pakartoti nereikia)

- Endpointai: `GET /api/external/v1/client-invoices`, `GET .../{id}`
- Query: `page`, `limit`, `status`, `updatedSince`, `issuedFrom`, `issuedTo`, `number`, `billingEntityId`
- Pagination: `{ page, limit, total, totalPages }`
- Laukų sąrašas: `id`, `number`, `status`, `docType`, buyer snapshot, `total`, `issuedAt`, `updatedAt`, `sourceProvider`, `sourceInvoiceId`, ir t. t.
- Rate limit ~100 req/min
- Tenant scoped per API key

---

## 3. Privalomas atsakymas — checklist

Užpildykite **visus** punktus. Jei kažko nėra — parašykite aiškiai `Nėra` / `Netaikoma` ir kodėl.

### 3.1. Produkcinis prieinamumas

- [ ] **Production base URL** (ne `localhost`)
- [ ] Ar yra staging/UAT URL?
- [ ] Ar TLS privalomas (`https`)?
- [ ] Ar kelias produkcijoje identiškas: `/api/external/v1/client-invoices`?
- [ ] Ar API key galioja tam pačiam tenant’ui, iš kurio KOT Sales turi skaityti sąskaitas?
- [ ] Kaip sukurti / rotuoti raktą (trumpai, be slapto rakto teksto)

### 3.2. Cutover langas (forward-only sync)

KOT Sales **neimportuos** visų istorinių Neksar sąskaitų iš naujo (kad nebūtų dublikatų su senais Sąskaita123 įrašais DB).

Reikia:

- [ ] **Rekomenduojama cutover data/laikas (UTC)** — nuo kada saugu traukti tik naujas sąskaitas
- [ ] Patvirtinimas: ar visos sąskaitos, išrašytos **po** šios datos, tikrai yra Neksar (ne Sąskaita123)?
- [ ] Ar `updatedSince` filtruoja pagal `updatedAt` ir ar jis patikimas inkrementiniam sync?
- [ ] Ar galima / reikia kombinuoti su `issuedFrom` pirmam paleidimui?
- [ ] Kas nutinka, jei sąskaita sukuriama su **atgaline** `issuedAt`, bet `updatedAt` yra po cutover — ar ji pateks į `updatedSince` srautą? (**Taip/Ne + paaiškinimas**)

### 3.3. Statusai — ką grąžinti KOT Sales

KOT Sales statusų **nerodo ir nesaugo**. Reikia tik to, kas atitinka „išrašytą“ sąskaitą UI/KPI.

Prašome patvirtinti rekomendaciją arba pataisyti:

| Status | Traukti į KOT Sales? | Jūsų atsakymas |
|---|---|---|
| `DRAFT` | **Ne** (siūlome) | |
| `SENT` | **Taip** | |
| `PAID` | **Taip** | |
| `OVERDUE` | **Taip** | |
| `CANCELLED` | **Ne** arba **Taip**? (nurodykite) | |
| Kiti statusai (jei yra) | Surāšykite | |

- [ ] Ar list endpoint be `status` grąžina **visus** statusus, įskaitant `DRAFT`?
- [ ] Ar galime filtruoti kelis statusus vienu request, ar tik vieną `status=` reikšmę? Jei tik vieną — kaip geriausia gauti `SENT+PAID+OVERDUE`?

### 3.4. Sąskaitos numeris ir serija (kritinis KOT Sales UI)

KOT Sales dabar naudoja atskirus laukus:

- `series_title` (pvz. `VK-000`) — UI/KPI filtras `VK-%`
- `series_number` (pvz. `28828`)
- `invoice_number` = serija + numeris
- Slepiami prefiksai: `VK-000IS*`, `VK-000KR*`

Neksar MD turi tik **`number`** + **`docType`**.

Reikia:

- [ ] Tikslus `number` formatas (regex arba taisyklės), pvz. `VK-00028828` / `VK-000-28828` / kita
- [ ] Ar visada yra stabili serijos dalis, kurią galime mapinti į `series_title`?
- [ ] Ar numerio dalis visada integer?
- [ ] Kaip atrodo **kreditinė** sąskaita `number` lauke? (pavyzdžiai)
- [ ] Kaip atrodo **proforma** `number` lauke?
- [ ] Ar `docType=CREDIT|PROFORMA|STANDARD` yra patikimesnis filtras nei numerio prefiksas?
- [ ] 5–10 **realių** `number` + `docType` porų (gali būti anonimizuota)

### 3.5. Kliento / pirkėjo laukai (mapping)

KOT Sales mapina į:

| KOT Sales laukas | Siūlomas Neksar šaltinis | Patvirtinkite / pataisykite |
|---|---|---|
| `client_id` | `clientId` | |
| `company_name` | `clientCompany` arba `clientName`? Kuris prioritetas? | |
| `company_code` | `buyerRegistrationNo` (o jei fizinis asmuo — `buyerPersonalCode`?) | |
| `vat_code` | `buyerVatNo` | |
| `address` | `buyerAddress` (+ city/postal/country?) | |
| `email` | `buyerEmail` | |
| `phone` | `buyerPhone` | |
| `invoice_date` | `issuedAt` (ar imti UTC datą?) | |
| `amount` | `total` (string → number) | |
| `invoice_id` (naujiems) | Neksar `id` | |

Papildomai:

- [ ] Ar `clientCompany` / `clientName` / `buyerRegistrationNo` gali būti tušti? Kada?
- [ ] Ar `total` visada su PVM (gross), kaip anksčiau SF123 `total`?
- [ ] Ar valiuta visada `EUR`? Jei ne — ar KOT Sales privalo žinoti `currency`?
- [ ] Laiko zona / UTC taisyklė `issuedAt` → kalendorinė data Lietuvai

### 3.6. ID ir importuoti įrašai

Kadangi **neperimportuojame** visos istorijos, legacy mapping nėra cutover blockeris. Vis tiek reikia aiškumo:

- [ ] Ar `id` nekinta per visą sąskaitos gyvavimą?
- [ ] Ar `id` unikalus tenant’e?
- [ ] Ką reiškia `sourceProvider` / `sourceInvoiceId` naujose (neimportuotose) sąskaitose? (`null`?)
- [ ] Ar API gali grąžinti senas importuotas SF123 sąskaitas, jei nekeliame filtrų? (**Taip/Ne**)
- [ ] Jei taip — kaip jas atskirti, kad KOT Sales jų **neimtų** antrą kartą? (`sourceProvider`, `importedAt`, data, kt.)

### 3.7. Puslapiavimas ir sync semantika

- [ ] Ar rezultatai su `updatedSince` surūšiuoti stabiliai? Pagal kokį lauką?
- [ ] Jei per sync atsiranda nauji `updatedAt`, ar vėlesni `page` juos praleidžia / dubliuoja?
- [ ] Ar saugus overlap (pakartoti tą patį `updatedSince`) — idempotentiška upsert logika OK?
- [ ] `429` — ar visada yra `retryAfter`? Header ar body?
- [ ] Maks. `limit` produkcijoje vis dar `100`?
- [ ] Ar yra soft/hard limitas, kiek seniai galima eiti su `updatedSince`?

### 3.8. Scope / izolacija

- [ ] Ar šis tenant grąžina **tik** tas sąskaitas, kurias turi matyti KOT Sales?
- [ ] Ar reikia filtro `billingEntityId`? Jei taip — koks ID?
- [ ] Ar vendor/translator sąskaitos tikrai niekada neįeina į šį endpoint?

---

## 4. Privalomi pavyzdžiai (JSON, ne PDF)

Į atsakymą įdėkite **anonimizuotus**, bet realistiškus API response.

### 4.1. List response (1 puslapis)

`GET /api/external/v1/client-invoices?page=1&limit=2&updatedSince=...`

Turi būti tikras shape su `data[]` + `pagination`.

### 4.2. Trys invoice objektai

1. **STANDARD** išrašyta sąskaita (tipinis KOT Sales atvejis)
2. **CREDIT**
3. **PROFORMA** (jei tokių būna šiame tenant’e; jei ne — parašykite `Nėra`)

Kiekviename objekte turi būti užpildyti bent:

`id`, `number`, `status`, `docType`, `issuedAt`, `updatedAt`, `total`, `currency`,  
`clientId`, `clientName`, `clientCompany`, `buyerRegistrationNo`, `buyerVatNo`,  
`buyerEmail`, `buyerPhone`, `buyerAddress`, `buyerCity`, `buyerPostalCode`, `buyerCountry`,  
`sourceProvider`, `sourceInvoiceId`, `importedAt`

(`lines` / `orders` galima sutrumpinti arba `[]`.)

### 4.3. Edge case (jei įmanoma)

Vienas pavyzdys, kur trūksta įmonės kodo / yra fizinis asmuo (`buyerPersonalCode`), jei tokie pasitaiko.

---

## 5. Pageidaujamas atsakymo formatas

Atsakykite **vienu MD** su skyriais:

```text
1. Production URL ir aplinka
2. Cutover data/laikas (UTC) + forward-only taisyklės
3. Statusų lentelė (ką traukti)
4. number / docType taisyklės + 5–10 pavyzdžių
5. Laukų mapping patvirtinimas (lentelė)
6. ID / sourceProvider elgsena
7. Pagination / updatedSince / 429 semantika
8. Scope (billingEntityId ar ne)
9. JSON pavyzdžiai (4.1–4.3)
10. Kas dar pasikeis netrukus (jei žinote)
```

Jei punktas nežinomas — rašykite `Nežinoma` ir kas turi patvirtinti (žmogus / kitas agentas), **nepraleiskite tyliai**.

---

## 6. Definition of Done (KOT Sales)

Šis request laikomas užbaigtu, kai:

1. Yra produkcinis base URL  
2. Yra cutover laikas ir forward-only taisyklė  
3. Aišku, kuriuos `status` traukti  
4. Aišku, kaip iš `number` + `docType` gauti tai, ką rodo KOT Sales (serija/numeris arba ekvivalentas)  
5. Patvirtintas buyer → company mapping  
6. Yra realūs JSON pavyzdžiai STANDARD (+ CREDIT/PROFORMA jei relevant)  
7. Aišku, kaip neįtraukti senų importuotų SF123 dublikatų  

Po to KOT Sales gali implementuoti adapterį ir atjungti Sąskaita123 sync.

---

## 7. Ko NEREIKIA siųsti

- API raktų / secretų
- PDF faktūrų (reikia API JSON, ne atspaudo)
- Visų istorinių sąskaitų dump
- Vendor invoice API

---

## 8. Trumpa KOT Sales sync schema (orientyrui)

```text
Kas ~15 min:
  GET {PROD}/api/external/v1/client-invoices
    ?updatedSince=<last_success_utc>
    &limit=100
    &page=1..N
    (+ status filtras, jei sutarta)

  → mapinti antraštę
  → upsert į KOT Sales DB pagal Neksar id (naujiems įrašams)
  → senų Sąskaita123 eilučių DB neperrašinėti masiniu reimportu
```
