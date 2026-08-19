export type CpNamedBlock = {
  title: string;
  body: string;
};

export type CpQualityStep = {
  number: string;
  title: string;
  body: string;
};

export type CpTemplateContent = {
  header_company: string;
  cover: {
    title: string;
    created_label: string;
    dedicated_label: string;
    issuer_line: string;
  };
  intro: {
    greeting: string;
    paragraphs: string[];
    manager_name: string;
    job_title: string;
  };
  history: {
    heading: string;
    year_suffix: string;
  };
  technology: {
    heading: string;
    blocks: CpNamedBlock[];
  };
  translation: {
    heading: string;
    description: string;
    prices_heading: string;
    footnote: string;
    col_nr: string;
    col_lang: string;
    col_price: string;
  };
  ai: {
    heading: string;
    prices_heading: string;
    footnote: string;
    col_nr: string;
    col_lang: string;
    col_price: string;
  };
  extras: {
    heading: string;
    col_nr: string;
    col_name: string;
    col_price: string;
  };
  uniqueness: {
    heading: string;
    blocks: CpNamedBlock[];
  };
  quality: {
    heading: string;
    steps: CpQualityStep[];
  };
};

export type CpTemplateVariables = {
  recipient_name: string;
  contact_name: string;
  sales_manager_name: string;
  sales_manager_job_title: string;
  issuer_company: string;
  proposal_number: string;
  proposal_date: string;
};

export const CP_TEMPLATE_VARIABLES: Array<{ key: keyof CpTemplateVariables; label: string }> = [
  { key: "recipient_name", label: "Gavėjo pavadinimas" },
  { key: "contact_name", label: "Kontaktinis asmuo" },
  { key: "sales_manager_name", label: "Vadybininko vardas" },
  { key: "sales_manager_job_title", label: "Vadybininko pareigos" },
  { key: "issuer_company", label: "Mūsų įmonė" },
  { key: "proposal_number", label: "Pasiūlymo numeris" },
  { key: "proposal_date", label: "Data" },
];

export function defaultTemplateContent(): CpTemplateContent {
  return {
    header_company: "Vertimų karaliai, UAB",
    cover: {
      title: "Vertimo paslaugų\npasiūlymas",
      created_label: "Sukūrė:",
      dedicated_label: "Skirta:",
      issuer_line: "{{issuer_company}}",
    },
    intro: {
      greeting: "Sveiki,",
      paragraphs: [
        "Ačiū už galimybę pristatyti mūsų vertimo paslaugų kainyną. Žemiau pateiktuose puslapiuose rasite mūsų teikiamų paslaugų įkainius ir kitą svarbią informaciją.",
        "Jeigu kiltų klausimų, ar norėtumėte suplanuoti susitikimą, maloniai prašome informuoti bet kuriuo metu.",
      ],
      manager_name: "{{sales_manager_name}}",
      job_title: "{{sales_manager_job_title}}",
    },
    history: {
      heading: "Mūsų istorija",
      year_suffix: "metais",
    },
    technology: {
      heading: "Technologijos",
      blocks: [
        {
          title: "Esame 5 kartus greitesni",
          body: "Su mūsų sukurta „KoT Cloud“ vertimų valdymo sistema Jūsų vertimo užklausas sutvarkome 5 kartus greičiau nei mūsų konkurentai",
        },
        {
          title: "Pažangiausias įrankis vertėjams",
          body: "Savo vertėjams sukūrėme unikalų CAT vertimo įrankį, pavadintą „KoT Editor“, kurio pagalba vertėjai užtikrina vertimų sklandumą, tikslumą ir kokybę",
        },
        { title: "VVS", body: "Organizuokite, automatizuokite ir supaprastinkite vertimo projektus" },
        { title: "Kokybės užtikrinimas", body: "Verifika 3.1, QA Distiller 9.1.5, Xbench 3.0, Linguistic Toolbox (LTB)" },
        { title: "Terminijos valdymas", body: "SDL Trados Studio, MemoQ, XTM Cloud, Memsource, KoT Editor" },
      ],
    },
    translation: {
      heading: "Vertimas raštu",
      description:
        "Mūsų trijų etapų vertimo valdymo procesas – vertimas, redagavimas, korektūra – užtikrina vertimo kokybę ir tikslumą.",
      prices_heading: "Kainos",
      footnote: "Pastaba: *Standartinį puslapį sudaro 1700 spaudos ženklų be tarpų.",
      col_nr: "Eil.\nNr.",
      col_lang: "Kalbų kombinacijos",
      col_price: "Kaina už standartinį\npuslapį* (be PVM)",
    },
    ai: {
      heading: "AI vertimas ir redagavimas",
      prices_heading: "Kainos",
      footnote: "Pastaba: *Standartinį puslapį sudaro 1700 spaudos ženklų be tarpų.",
      col_nr: "Eil.\nNr.",
      col_lang: "Kalbų kombinacijos",
      col_price: "Kaina už standartinį\npuslapį* (be PVM)",
    },
    extras: {
      heading: "Papildomų paslaugų įkainiai",
      col_nr: "Eil. Nr.",
      col_name: "Paslaugos pavadinimas",
      col_price: "Kaina EUR (be PVM)",
    },
    uniqueness: {
      heading: "Išskirtinumas",
      blocks: [
        { title: "Kvalifikuoti lingvistai", body: "Geriausiai savo sritį išmanantys vertėjai" },
        { title: "Dvikalbis maketavimas", body: "Sudarome dvikalbį turinį nemokamai: vienoje pusėje originalas, kitoje vertimas" },
        { title: "Tikslumo užtikrinimas", body: "Garantuojame tikslumą ir konfidencialumą" },
        {
          title: "Identiškas maketavimas",
          body: "Dirbame su Adobe Illustrator, InDesign, kad išlaikytume originalų maketą",
        },
        { title: "24/7 darbo laikas", body: "Atsakome į Jūsų užklausas net ir vėlyvais sekmadienio vakarais" },
        { title: "Oficialūs patvirtinimai", body: "Visų rūšių oficialūs patvirtinimai (apostilės, notarizavimas ir kt.)" },
        { title: "Skubūs terminai", body: "Netaikome papildomų antkainių už skubius vertimo terminus" },
        { title: "Nuoseklumo kontrolė", body: "Suvienodinta terminologija ir stilius visuose vertimuose" },
        { title: "Programų suderinamumas", body: "Naudojame tas pačias programas kaip ir mūsų klientai" },
        { title: "Konsultacijos", body: "Nemokamos specialistų konsultacijos" },
      ],
    },
    quality: {
      heading: "Vertimo kokybės užtikrinimo procesas",
      steps: [
        {
          number: "1",
          title: "Projekto pradžia",
          body: "Projektų koordinatorius nustato kliento poreikius ir parengia asmeninį pasiūlymą. Gavęs kliento patvirtinimą, projektų koordinatorius susistemina pateiktą informaciją ir reikalavimus siekiant maksimalaus rezultato",
        },
        {
          number: "2",
          title: "Projekto parengimas",
          body: "Mūsų vidinėje sistemoje įrašomi kliento duomenys ir projekto specifika, tada pereinama prie užduočių planavimo. Nustatoma su projektu susijusi vertimo atmintis ir terminologija. Pagal reikiamą kompetenciją projektui priskiriami lingvistai ir kiti atitinkami specialistai",
        },
        {
          number: "3",
          title: "Vertimo procesas",
          body: "Priskirtas lingvista išverčia turinį į pageidaujamą kalbą, o po to koreguoja vertimo tikslumą",
        },
        {
          number: "4",
          title: "Redagavimas ir peržiūra",
          body: "Nepriklausomas redaktorius tobulina išverstą turinį. Tuomet priskirtasis lingvistas dar kartą peržiūri suredaguotą tekstą, kad įsitikintų, jog nepakito išversto turinio reikšmė ir prasmė",
        },
        {
          number: "5",
          title: "Korektūra ir galutinė peržiūra",
          body: "Atliekami galutiniai pakeitimai, po kurių projektų koordinatorius atlieka galutinę peržiūrą",
        },
        {
          number: "6",
          title: "Projekto pristatymas",
          body: "Galutinis vertimas, atitinkantis visus reikalavimus ir kokybės standartus, pristatomas klientui",
        },
      ],
    },
  };
}

export function interpolateTemplateText(text: string, vars: CpTemplateVariables): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const k = key as keyof CpTemplateVariables;
    return vars[k] ?? "";
  });
}

export function interpolateTemplateContent(content: CpTemplateContent, vars: CpTemplateVariables): CpTemplateContent {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return interpolateTemplateText(value, vars);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v);
      return out;
    }
    return value;
  };
  return walk(content) as CpTemplateContent;
}

export function mergeTemplateContent(raw: unknown): CpTemplateContent {
  const base = defaultTemplateContent();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Record<string, unknown>;
  const pickStr = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const cover = (src.cover ?? {}) as Record<string, unknown>;
  const intro = (src.intro ?? {}) as Record<string, unknown>;
  const history = (src.history ?? {}) as Record<string, unknown>;
  const technology = (src.technology ?? {}) as Record<string, unknown>;
  const translation = (src.translation ?? {}) as Record<string, unknown>;
  const ai = (src.ai ?? {}) as Record<string, unknown>;
  const extras = (src.extras ?? {}) as Record<string, unknown>;
  const uniqueness = (src.uniqueness ?? {}) as Record<string, unknown>;
  const quality = (src.quality ?? {}) as Record<string, unknown>;

  const named = (arr: unknown, fallback: CpNamedBlock[]): CpNamedBlock[] => {
    if (!Array.isArray(arr) || arr.length === 0) return fallback;
    return arr.map((item, i) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const fb = fallback[i] ?? { title: "", body: "" };
      return { title: pickStr(row.title, fb.title), body: pickStr(row.body, fb.body) };
    });
  };
  const steps = (arr: unknown): CpQualityStep[] => {
    if (!Array.isArray(arr) || arr.length === 0) return base.quality.steps;
    return arr.map((item, i) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const fb = base.quality.steps[i] ?? { number: String(i + 1), title: "", body: "" };
      return {
        number: pickStr(row.number, fb.number),
        title: pickStr(row.title, fb.title),
        body: pickStr(row.body, fb.body),
      };
    });
  };

  return {
    header_company: pickStr(src.header_company, base.header_company),
    cover: {
      title: pickStr(cover.title, base.cover.title),
      created_label: pickStr(cover.created_label, base.cover.created_label),
      dedicated_label: pickStr(cover.dedicated_label, base.cover.dedicated_label),
      issuer_line: pickStr(cover.issuer_line, base.cover.issuer_line),
    },
    intro: {
      greeting: pickStr(intro.greeting, base.intro.greeting),
      paragraphs: Array.isArray(intro.paragraphs)
        ? intro.paragraphs.map((p, i) => pickStr(p, base.intro.paragraphs[i] ?? ""))
        : base.intro.paragraphs,
      manager_name: pickStr(intro.manager_name, base.intro.manager_name),
      job_title: pickStr(intro.job_title, base.intro.job_title),
    },
    history: {
      heading: pickStr(history.heading, base.history.heading),
      year_suffix: pickStr(history.year_suffix, base.history.year_suffix),
    },
    technology: {
      heading: pickStr(technology.heading, base.technology.heading),
      blocks: named(technology.blocks, base.technology.blocks),
    },
    translation: {
      heading: pickStr(translation.heading, base.translation.heading),
      description: pickStr(translation.description, base.translation.description),
      prices_heading: pickStr(translation.prices_heading, base.translation.prices_heading),
      footnote: pickStr(translation.footnote, base.translation.footnote),
      col_nr: pickStr(translation.col_nr, base.translation.col_nr),
      col_lang: pickStr(translation.col_lang, base.translation.col_lang),
      col_price: pickStr(translation.col_price, base.translation.col_price),
    },
    ai: {
      heading: pickStr(ai.heading, base.ai.heading),
      prices_heading: pickStr(ai.prices_heading, base.ai.prices_heading),
      footnote: pickStr(ai.footnote, base.ai.footnote),
      col_nr: pickStr(ai.col_nr, base.ai.col_nr),
      col_lang: pickStr(ai.col_lang, base.ai.col_lang),
      col_price: pickStr(ai.col_price, base.ai.col_price),
    },
    extras: {
      heading: pickStr(extras.heading, base.extras.heading),
      col_nr: pickStr(extras.col_nr, base.extras.col_nr),
      col_name: pickStr(extras.col_name, base.extras.col_name),
      col_price: pickStr(extras.col_price, base.extras.col_price),
    },
    uniqueness: {
      heading: pickStr(uniqueness.heading, base.uniqueness.heading),
      blocks: named(uniqueness.blocks, base.uniqueness.blocks),
    },
    quality: {
      heading: pickStr(quality.heading, base.quality.heading),
      steps: steps(quality.steps),
    },
  };
}

export type CpOverflowWarning = { path: string; message: string };

export const TEMPLATE_OVERFLOW_MESSAGE =
  "Tekstas per ilgas šiam maketui. Sutrumpink tekstą arba pasirink trumpesnę versiją.";
