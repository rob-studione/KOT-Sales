"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  publishTemplateAction,
  saveTemplateDraftAction,
} from "@/lib/crm/commercialProposalActions";
import { CP_TEMPLATE_VARIABLES, type CpTemplateContent } from "@/lib/commercialProposal/content";
import { CompanyHistoryAdminClient } from "@/components/crm/commercial-proposal/CompanyHistoryAdminClient";
import type { CpCompanyHistoryEntry } from "@/lib/commercialProposal/types";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const cls = "mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm";
  if (multiline) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={cls} />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} h-9 py-0`} />;
}

export function TemplateEditorClient({
  initial,
  history,
}: {
  initial: CpTemplateContent;
  history: CpCompanyHistoryEntry[];
}) {
  const [content, setContent] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const variableHint = useMemo(
    () => CP_TEMPLATE_VARIABLES.map((v) => `{{${v.key}}} — ${v.label}`).join(" · "),
    []
  );

  function setCover<K extends keyof CpTemplateContent["cover"]>(key: K, value: string) {
    setContent((c) => ({ ...c, cover: { ...c.cover, [key]: value } }));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-zinc-500">
          Dinaminiai laukai: {variableHint}. Gavėjo ir vadybininko reikšmės užpildomos kuriant pasiūlymą.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => {
              setMessage(null);
              start(async () => {
                const res = await fetch("/api/crm/commercial-proposals/template-preview", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                });
                if (!res.ok) {
                  const body = (await res.json().catch(() => null)) as { error?: string } | null;
                  setMessage(body?.error ?? "Nepavyko paruošti preview.");
                  return;
                }
                const raw = res.headers.get("X-CP-Warnings");
                if (raw) {
                  try {
                    const parsed = JSON.parse(decodeURIComponent(raw)) as Array<{ message: string }>;
                    setWarnings(parsed.map((w) => w.message));
                  } catch {
                    setWarnings([]);
                  }
                } else setWarnings([]);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(URL.createObjectURL(await res.blob()));
              });
            }}
          >
            Preview PDF
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => {
              start(async () => {
                const res = await saveTemplateDraftAction(content);
                setMessage(res.ok ? "Juodraštis išsaugotas." : res.error);
              });
            }}
          >
            Išsaugoti juodraštį
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={() => {
              start(async () => {
                const res = await publishTemplateAction(content);
                setMessage(res.ok ? "Šablonas publikuotas. Nauji pasiūlymai naudos šį turinį." : res.error);
              });
            }}
          >
            Publikuoti
          </button>
        </div>
      </div>
      {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
      {warnings.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warnings.join(" ")}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Viršelis</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Pavadinimas">
            <TextInput value={content.cover.title} onChange={(v) => setCover("title", v)} multiline />
          </Field>
          <Field label="Sukūrė label" hint="Dinaminis: vadybininkas">
            <TextInput value={content.cover.created_label} onChange={(v) => setCover("created_label", v)} />
          </Field>
          <Field label="Skirta label" hint="Dinaminis: gavėjas">
            <TextInput value={content.cover.dedicated_label} onChange={(v) => setCover("dedicated_label", v)} />
          </Field>
          <Field label="Mūsų įmonė">
            <TextInput value={content.cover.issuer_line} onChange={(v) => setCover("issuer_line", v)} />
          </Field>
          <Field label="Antraštė kituose puslapiuose">
            <TextInput
              value={content.header_company}
              onChange={(v) => setContent((c) => ({ ...c, header_company: v }))}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Įžanga</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Pasveikinimas">
            <TextInput
              value={content.intro.greeting}
              onChange={(v) => setContent((c) => ({ ...c, intro: { ...c.intro, greeting: v } }))}
            />
          </Field>
          {content.intro.paragraphs.map((p, i) => (
            <Field key={i} label={`Tekstas ${i + 1}`}>
              <TextInput
                value={p}
                multiline
                onChange={(v) =>
                  setContent((c) => {
                    const paragraphs = [...c.intro.paragraphs];
                    paragraphs[i] = v;
                    return { ...c, intro: { ...c.intro, paragraphs } };
                  })
                }
              />
            </Field>
          ))}
          <Field label="Vadybininko vardas" hint="Paprastai {{sales_manager_name}}">
            <TextInput
              value={content.intro.manager_name}
              onChange={(v) => setContent((c) => ({ ...c, intro: { ...c.intro, manager_name: v } }))}
            />
          </Field>
          <Field label="Pareigos" hint="Paprastai {{sales_manager_job_title}}">
            <TextInput
              value={content.intro.job_title}
              onChange={(v) => setContent((c) => ({ ...c, intro: { ...c.intro, job_title: v } }))}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Mūsų istorija — tekstai</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Antraštė">
            <TextInput
              value={content.history.heading}
              onChange={(v) => setContent((c) => ({ ...c, history: { ...c.history, heading: v } }))}
            />
          </Field>
          <Field label="Metų priesaga">
            <TextInput
              value={content.history.year_suffix}
              onChange={(v) => setContent((c) => ({ ...c, history: { ...c.history, year_suffix: v } }))}
            />
          </Field>
        </div>
      </section>
      <CompanyHistoryAdminClient initial={history} />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Technologijos</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Antraštė">
            <TextInput
              value={content.technology.heading}
              onChange={(v) => setContent((c) => ({ ...c, technology: { ...c.technology, heading: v } }))}
            />
          </Field>
          {content.technology.blocks.map((block, i) => (
            <div key={i} className="rounded-lg border border-zinc-100 p-3">
              <div className="text-xs font-medium text-zinc-500">Blokas {i + 1}</div>
              <Field label="Pavadinimas">
                <TextInput
                  value={block.title}
                  onChange={(v) =>
                    setContent((c) => {
                      const blocks = c.technology.blocks.map((b, idx) => (idx === i ? { ...b, title: v } : b));
                      return { ...c, technology: { ...c.technology, blocks } };
                    })
                  }
                />
              </Field>
              <Field label="Tekstas">
                <TextInput
                  value={block.body}
                  multiline
                  onChange={(v) =>
                    setContent((c) => {
                      const blocks = c.technology.blocks.map((b, idx) => (idx === i ? { ...b, body: v } : b));
                      return { ...c, technology: { ...c.technology, blocks } };
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Vertimas raštu</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Antraštė">
            <TextInput
              value={content.translation.heading}
              onChange={(v) => setContent((c) => ({ ...c, translation: { ...c.translation, heading: v } }))}
            />
          </Field>
          <Field label="Aprašymas">
            <TextInput
              value={content.translation.description}
              multiline
              onChange={(v) => setContent((c) => ({ ...c, translation: { ...c.translation, description: v } }))}
            />
          </Field>
          <Field label="Kainos antraštė">
            <TextInput
              value={content.translation.prices_heading}
              onChange={(v) => setContent((c) => ({ ...c, translation: { ...c.translation, prices_heading: v } }))}
            />
          </Field>
          <Field label="Išnaša">
            <TextInput
              value={content.translation.footnote}
              onChange={(v) => setContent((c) => ({ ...c, translation: { ...c.translation, footnote: v } }))}
            />
          </Field>
          <Field label="Stulpelis Nr.">
            <TextInput
              value={content.translation.col_nr}
              onChange={(v) => setContent((c) => ({ ...c, translation: { ...c.translation, col_nr: v } }))}
            />
          </Field>
          <Field label="Stulpelis kalbos">
            <TextInput
              value={content.translation.col_lang}
              onChange={(v) => setContent((c) => ({ ...c, translation: { ...c.translation, col_lang: v } }))}
            />
          </Field>
          <Field label="Stulpelis kaina">
            <TextInput
              value={content.translation.col_price}
              onChange={(v) => setContent((c) => ({ ...c, translation: { ...c.translation, col_price: v } }))}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">AI vertimas ir redagavimas</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Antraštė">
            <TextInput value={content.ai.heading} onChange={(v) => setContent((c) => ({ ...c, ai: { ...c.ai, heading: v } }))} />
          </Field>
          <Field label="Kainos antraštė">
            <TextInput
              value={content.ai.prices_heading}
              onChange={(v) => setContent((c) => ({ ...c, ai: { ...c.ai, prices_heading: v } }))}
            />
          </Field>
          <Field label="Išnaša">
            <TextInput value={content.ai.footnote} onChange={(v) => setContent((c) => ({ ...c, ai: { ...c.ai, footnote: v } }))} />
          </Field>
          <Field label="Stulpelis Nr.">
            <TextInput value={content.ai.col_nr} onChange={(v) => setContent((c) => ({ ...c, ai: { ...c.ai, col_nr: v } }))} />
          </Field>
          <Field label="Stulpelis kalbos">
            <TextInput value={content.ai.col_lang} onChange={(v) => setContent((c) => ({ ...c, ai: { ...c.ai, col_lang: v } }))} />
          </Field>
          <Field label="Stulpelis kaina">
            <TextInput value={content.ai.col_price} onChange={(v) => setContent((c) => ({ ...c, ai: { ...c.ai, col_price: v } }))} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Papildomų paslaugų įkainiai</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Antraštė">
            <TextInput
              value={content.extras.heading}
              onChange={(v) => setContent((c) => ({ ...c, extras: { ...c.extras, heading: v } }))}
            />
          </Field>
          <Field label="Stulpelis Nr.">
            <TextInput
              value={content.extras.col_nr}
              onChange={(v) => setContent((c) => ({ ...c, extras: { ...c.extras, col_nr: v } }))}
            />
          </Field>
          <Field label="Stulpelis pavadinimas">
            <TextInput
              value={content.extras.col_name}
              onChange={(v) => setContent((c) => ({ ...c, extras: { ...c.extras, col_name: v } }))}
            />
          </Field>
          <Field label="Stulpelis kaina">
            <TextInput
              value={content.extras.col_price}
              onChange={(v) => setContent((c) => ({ ...c, extras: { ...c.extras, col_price: v } }))}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Išskirtinumas</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Antraštė">
            <TextInput
              value={content.uniqueness.heading}
              onChange={(v) => setContent((c) => ({ ...c, uniqueness: { ...c.uniqueness, heading: v } }))}
            />
          </Field>
          {content.uniqueness.blocks.map((block, i) => (
            <div key={i} className="rounded-lg border border-zinc-100 p-3">
              <div className="text-xs font-medium text-zinc-500">Blokas {i + 1}</div>
              <Field label="Pavadinimas">
                <TextInput
                  value={block.title}
                  onChange={(v) =>
                    setContent((c) => {
                      const blocks = c.uniqueness.blocks.map((b, idx) => (idx === i ? { ...b, title: v } : b));
                      return { ...c, uniqueness: { ...c.uniqueness, blocks } };
                    })
                  }
                />
              </Field>
              <Field label="Tekstas">
                <TextInput
                  value={block.body}
                  multiline
                  onChange={(v) =>
                    setContent((c) => {
                      const blocks = c.uniqueness.blocks.map((b, idx) => (idx === i ? { ...b, body: v } : b));
                      return { ...c, uniqueness: { ...c.uniqueness, blocks } };
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Vertimo kokybės užtikrinimo procesas</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Antraštė">
            <TextInput
              value={content.quality.heading}
              onChange={(v) => setContent((c) => ({ ...c, quality: { ...c.quality, heading: v } }))}
            />
          </Field>
          {content.quality.steps.map((step, i) => (
            <div key={i} className="rounded-lg border border-zinc-100 p-3">
              <Field label={`Žingsnis ${i + 1} numeris`}>
                <TextInput
                  value={step.number}
                  onChange={(v) =>
                    setContent((c) => {
                      const steps = c.quality.steps.map((s, idx) => (idx === i ? { ...s, number: v } : s));
                      return { ...c, quality: { ...c.quality, steps } };
                    })
                  }
                />
              </Field>
              <Field label="Pavadinimas">
                <TextInput
                  value={step.title}
                  onChange={(v) =>
                    setContent((c) => {
                      const steps = c.quality.steps.map((s, idx) => (idx === i ? { ...s, title: v } : s));
                      return { ...c, quality: { ...c.quality, steps } };
                    })
                  }
                />
              </Field>
              <Field label="Tekstas">
                <TextInput
                  value={step.body}
                  multiline
                  onChange={(v) =>
                    setContent((c) => {
                      const steps = c.quality.steps.map((s, idx) => (idx === i ? { ...s, body: v } : s));
                      return { ...c, quality: { ...c.quality, steps } };
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      {previewUrl ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <iframe title="Šablono preview" className="h-[90vh] w-full" src={previewUrl} />
        </div>
      ) : null}
    </div>
  );
}
