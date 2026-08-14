"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";

export function NewSearchForm({ canRun }: { canRun: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!canRun) {
    return (
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Nauja paieška</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
          Paiešką gali paleisti tik administratorius. Galite peržiūrėti kandidatus ir istoriją.
        </p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    const seedUrls = String(fd.get("seedUrls") ?? "")
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);

    const body = {
      languageFrom: String(fd.get("languageFrom") ?? "").trim(),
      languageTo: String(fd.get("languageTo") ?? "").trim(),
      country: String(fd.get("country") ?? "").trim(),
      city: String(fd.get("city") ?? "").trim() || undefined,
      certification: String(fd.get("certification") ?? "any"),
      specialization: String(fd.get("specialization") ?? "").trim() || undefined,
      candidateType: String(fd.get("candidateType") ?? "any"),
      targetCandidates: Number(fd.get("targetCandidates") || TRANSLATOR_SEARCH_LIMITS.defaultTargetCandidates),
      maxBudgetEur: Number(fd.get("maxBudgetEur") || TRANSLATOR_SEARCH_LIMITS.defaultBudgetEur),
      seedUrls,
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/crm/translator-search/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let json: {
          ok?: boolean;
          error?: string;
          jobId?: string;
          status?: string;
          warning?: string | null;
          reusedExistingJob?: boolean;
        } = {};
        try {
          json = text ? (JSON.parse(text) as typeof json) : {};
        } catch {
          setError("Serveris grąžino netikėtą atsakymą.");
          return;
        }
        if (!res.ok || !json.ok) {
          setError(json.error || `Klaida (${res.status})`);
          return;
        }
        setSuccess(
          json.reusedExistingJob
            ? `Aktyvus job jau vyksta / egzistuoja: ${json.jobId}`
            : `Paieška baigta (${json.status}). Job: ${json.jobId}${json.warning ? ` · ${json.warning}` : ""}`
        );
        router.refresh();
      } catch {
        setError("Tinklo klaida — bandykite dar kartą.");
      }
    });
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
  const labelClass = "block text-sm font-medium text-zinc-800";

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-zinc-900">Nauja paieška</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
        Automatinė HTML šaltinių paieška pagal kriterijus. Seed HTTPS URL optional (0–3).
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Kalba iš *
            <input name="languageFrom" required className={inputClass} placeholder="English" defaultValue="English" />
          </label>
          <label className={labelClass}>
            Kalba į *
            <input name="languageTo" required className={inputClass} placeholder="Dutch" defaultValue="Dutch" />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Šalis *
            <input name="country" required className={inputClass} placeholder="Belgium" defaultValue="Belgium" />
          </label>
          <label className={labelClass}>
            Miestas
            <input name="city" className={inputClass} placeholder="optional" />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Sertifikavimas *
            <select name="certification" className={inputClass} defaultValue="required">
              <option value="any">any</option>
              <option value="required">required (sworn/certified)</option>
            </select>
          </label>
          <label className={labelClass}>
            Tipas *
            <select name="candidateType" className={inputClass} defaultValue="freelancer">
              <option value="any">any</option>
              <option value="freelancer">freelancer</option>
              <option value="agency">agency</option>
            </select>
          </label>
        </div>
        <label className={labelClass}>
          Specializacija
          <input name="specialization" className={inputClass} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Norimi kandidatai (1–{TRANSLATOR_SEARCH_LIMITS.maxTargetCandidates}) *
            <input
              name="targetCandidates"
              type="number"
              min={1}
              max={TRANSLATOR_SEARCH_LIMITS.maxTargetCandidates}
              defaultValue={TRANSLATOR_SEARCH_LIMITS.defaultTargetCandidates}
              className={inputClass}
              required
            />
          </label>
          <label className={labelClass}>
            Maks. biudžetas EUR (≤{TRANSLATOR_SEARCH_LIMITS.maxBudgetEur}) *
            <input
              name="maxBudgetEur"
              type="number"
              min={0.01}
              max={TRANSLATOR_SEARCH_LIMITS.maxBudgetEur}
              step={0.01}
              defaultValue={TRANSLATOR_SEARCH_LIMITS.defaultBudgetEur}
              className={inputClass}
              required
            />
          </label>
        </div>
        <label className={labelClass}>
          Seed HTTPS URL (0–{TRANSLATOR_SEARCH_LIMITS.maxSeedUrls}, optional, po vieną eilutėje)
          <textarea
            name="seedUrls"
            rows={3}
            className={inputClass}
            placeholder={"https://example.com/translator\nhttps://example.com/profile"}
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Vykdoma…" : "Paleisti paiešką"}
        </button>
      </form>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-4 text-sm text-emerald-700">{success}</p> : null}
      {pending ? <p className="mt-3 text-sm text-zinc-500">Paieška vykdoma — palaukite…</p> : null}
    </div>
  );
}
