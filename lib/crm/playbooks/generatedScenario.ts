export type GeneratedScenarioNode = {
  title: string;
  body: string;
  type?: string;
};

export type GeneratedScenarioEdge = {
  from_index: number;
  to_index: number;
  label: string;
};

export type GeneratedScenario = {
  nodes: GeneratedScenarioNode[];
  edges: GeneratedScenarioEdge[];
};

export type GeneratedScenarioValidation =
  | { ok: true; value: GeneratedScenario }
  | { ok: false; error: string };

export function parseGeneratedScenarioJson(raw: string): GeneratedScenarioValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "Neteisingas JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "JSON turi būti objektas." };
  }
  const o = parsed as Record<string, unknown>;
  if (!Array.isArray(o.nodes)) {
    return { ok: false, error: "Trūksta masyvo nodes." };
  }
  if (!Array.isArray(o.edges)) {
    return { ok: false, error: "Trūksta masyvo edges." };
  }

  const nodes: GeneratedScenarioNode[] = [];
  for (let i = 0; i < o.nodes.length; i++) {
    const n = o.nodes[i];
    if (!n || typeof n !== "object") {
      return { ok: false, error: `nodes[${i}] turi būti objektas.` };
    }
    const r = n as Record<string, unknown>;
    if (typeof r.title !== "string" || !r.title.trim()) {
      return { ok: false, error: `nodes[${i}].title privalomas (string).` };
    }
    if (typeof r.body !== "string") {
      return { ok: false, error: `nodes[${i}].body privalomas (string).` };
    }
    const type = r.type === undefined || r.type === null ? undefined : String(r.type);
    nodes.push({
      title: r.title.trim(),
      body: r.body,
      type: type?.trim() || undefined,
    });
  }

  const edges: GeneratedScenarioEdge[] = [];
  for (let i = 0; i < o.edges.length; i++) {
    const e = o.edges[i];
    if (!e || typeof e !== "object") {
      return { ok: false, error: `edges[${i}] turi būti objektas.` };
    }
    const r = e as Record<string, unknown>;
    if (typeof r.label !== "string" || !r.label.trim()) {
      return { ok: false, error: `edges[${i}].label privalomas (string).` };
    }
    if (typeof r.from_index !== "number" || !Number.isInteger(r.from_index) || r.from_index < 0) {
      return { ok: false, error: `edges[${i}].from_index turi būti >= 0 sveikasis skaičius.` };
    }
    if (typeof r.to_index !== "number" || !Number.isInteger(r.to_index) || r.to_index < 0) {
      return { ok: false, error: `edges[${i}].to_index turi būti >= 0 sveikasis skaičius.` };
    }
    if (r.from_index >= nodes.length || r.to_index >= nodes.length) {
      return { ok: false, error: `edges[${i}] rodo už ribų esantį node indeksą.` };
    }
    edges.push({
      from_index: r.from_index,
      to_index: r.to_index,
      label: r.label.trim(),
    });
  }

  return { ok: true, value: { nodes, edges } };
}
