import { NextResponse } from "next/server";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";
import { createOpenAIClient } from "@/lib/openai/serverClient";
import type { GeneratedScenario } from "@/lib/crm/playbooks/generatedScenario";
import { parseGeneratedScenarioJson } from "@/lib/crm/playbooks/generatedScenario";

export const dynamic = "force-dynamic";

const MODEL = "gpt-4o-mini";

type Body = {
  goal?: unknown;
  context?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!goal) {
    return NextResponse.json({ ok: false, error: "Missing goal" }, { status: 400 });
  }

  let client;
  try {
    client = createOpenAIClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI not configured";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const system = `Tu padedi kurti CRM pokalbio scenarijus (playbook).
Grąžink TIK vieną JSON objektą be markdown ir be paaiškinimų.

Schema:
{
  "nodes": [
    { "title": "string", "body": "string", "type": "message" | "end" }
  ],
  "edges": [
    { "from_index": 0, "to_index": 1, "label": "string" }
  ]
}

Taisyklės:
- nodes masyvas apibrėžia žingsnius eilės tvarka; indeksai 0..n-1.
- edges naudoja from_index ir to_index į nodes masyvą.
- Pirmasis node (indeksas 0) turėtų būti pradinis kontaktas.
- type "end" naudok galutiniams žingsniams be tolimesnių šakų.
- body gali būti kelių eilučių tekstas lietuviškai.
- label — trumpas mygtuko tekstas lietuviškai (kas vartotojui rodoma kaip pasirinkimas).`;

  const userMsg = [
    `Tikslas / kontekstas scenarijui: ${goal}`,
    context ? `Papildomas kontekstas: ${context}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: string;
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    });
    raw = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI klaida";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (!raw) {
    return NextResponse.json({ ok: false, error: "Tuščias atsakymas iš modelio." }, { status: 500 });
  }

  const validated = parseGeneratedScenarioJson(raw);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error, raw },
      { status: 422 },
    );
  }

  const scenario = validated.value as GeneratedScenario;
  return NextResponse.json({ ok: true, scenario, raw });
}
