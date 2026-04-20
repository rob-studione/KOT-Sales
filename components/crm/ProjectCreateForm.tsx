"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { formatMoney } from "@/lib/crm/format";
import { projectSortLabel } from "@/lib/crm/projectSnapshot";
import { ProjectCandidateCallList } from "@/components/crm/ProjectCandidateCallList";
import {
  createProjectFromForm,
  previewProjectSnapshot,
  type ProjectPreviewResult,
} from "@/lib/crm/projectActions";
import type { CrmUser } from "@/lib/crm/crmUsers";
import { UserAvatar } from "@/components/crm/UserAvatar";
import { isManualProjectType, isProcurementProjectType, projectTypeLabelLt } from "@/lib/crm/projectType";

type ProjectFormType = "automatic" | "manual" | "procurement";

export function ProjectCreateForm({ users }: { users: CrmUser[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [projectType, setProjectType] = useState<ProjectFormType>("automatic");
  const [preview, setPreview] = useState<ProjectPreviewResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isCreating, startCreate] = useTransition();

  const isManual = isManualProjectType(projectType);
  const isProcurement = isProcurementProjectType(projectType);
  const isAutomatic = projectType === "automatic";

  return (
    <form ref={formRef} id="project-create-form" className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="project_type" value={projectType} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-zinc-700">Projekto tipas</span>
        <div
          className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5"
          role="group"
          aria-label="Projekto tipas"
        >
          <button
            type="button"
            onClick={() => {
              setProjectType("automatic");
              setPreview(null);
            }}
            className={
              isAutomatic
                ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
            }
            aria-pressed={isAutomatic}
          >
            {projectTypeLabelLt("automatic")}
          </button>
          <button
            type="button"
            onClick={() => {
              setProjectType("manual");
              setPreview(null);
            }}
            className={
              isManual
                ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
            }
            aria-pressed={isManual}
          >
            {projectTypeLabelLt("manual")}
          </button>
          <button
            type="button"
            onClick={() => {
              setProjectType("procurement");
              setPreview(null);
            }}
            className={
              isProcurement
                ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
            }
            aria-pressed={isProcurement}
          >
            {projectTypeLabelLt("procurement")}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Projekto pavadinimas</span>
          <input
            name="name"
            type="text"
            required
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            placeholder="pvz. Q1 atgal į klientus"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700">Aprašymas</span>
          <textarea
            name="description"
            rows={2}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            placeholder="Trumpai, kam skirtas projektas"
          />
        </label>

        {isManual ? (
          <p className="text-sm leading-relaxed text-zinc-600 sm:col-span-2">
            Šiame projekte kandidatai nepridedami automatiškai. Juos galėsite pridėti rankiniu būdu po projekto sukūrimo.
          </p>
        ) : null}

        {isProcurement ? (
          <>
            <p className="text-sm leading-relaxed text-zinc-600 sm:col-span-2">
              Stebėkite viešųjų pirkimų sutartis ir gaukite priminimus prieš jų pabaigą.
            </p>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Pranešti prieš (dienomis)</span>
              <input
                name="procurement_notify_days_before"
                type="number"
                min={0}
                max={365}
                defaultValue={14}
                className="max-w-[160px] rounded-md border border-zinc-200 px-2 py-1.5 text-sm tabular-nums"
              />
              <span className="text-xs text-zinc-500">
                Po sukūrimo įkelkite sutarčių CSV skiltyje „Sutartys“. Numatytasis priminimas taikomas naujai importuotoms
                eilutėms.
              </span>
            </label>
          </>
        ) : null}

        {isAutomatic ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Data nuo</span>
              <input
                name="date_from"
                type="date"
                required
                lang="lt"
                className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Data iki</span>
              <input
                name="date_to"
                type="date"
                required
                lang="lt"
                className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Min. sąskaitų skaičius intervale</span>
              <input
                name="min_order_count"
                type="number"
                min={1}
                defaultValue={1}
                className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Neaktyvumo slenkstis (dienos)</span>
              <input
                name="inactivity_days"
                type="number"
                min={1}
                max={3650}
                defaultValue={90}
                className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-zinc-500">
                Paskutinė sąskaita (iš visų duomenų) turi būti senesnė nei šiandien minus šis skaičius.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Kandidatų rikiavimas</span>
              <select name="sort_option" className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm">
                <option value="revenue_desc">{projectSortLabel("revenue_desc")}</option>
                <option value="last_invoice_desc">{projectSortLabel("last_invoice_desc")}</option>
                <option value="order_count_desc">{projectSortLabel("order_count_desc")}</option>
              </select>
            </label>
          </>
        ) : null}

        {users.length === 0 ? (
          <p className="text-sm text-amber-800 sm:col-span-2">
            Nėra naudotojų. Pridėkite bent vieną įrašą į lentelę <code className="rounded bg-zinc-100 px-1">crm_users</code>{" "}
            (migracija <code className="rounded bg-zinc-100 px-1">0025_accounts_auth.sql</code>).
          </p>
        ) : users.length === 1 ? (
          <>
            <input type="hidden" name="owner_user_id" value={users[0]!.id} />
            <div className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Atsakingas</span>
              <UserAvatar displayName={users[0]!.name} avatarUrl={users[0]!.avatar_url} size={26} />
              <span className="text-zinc-900">{users[0]!.name}</span>
            </div>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700">Atsakingas</span>
            <select
              name="owner_user_id"
              required
              defaultValue=""
              className="max-w-md rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                Pasirinkite…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {isAutomatic ? (
          <button
            type="button"
            disabled={isPreviewing}
            className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => {
              const el = formRef.current;
              if (!el) return;
              startPreview(async () => {
                setCreateError(null);
                const r = await previewProjectSnapshot(new FormData(el));
                setPreview(r);
              });
            }}
          >
            {isPreviewing ? "Skaičiuojama…" : "Peržiūrėti atitikmenis"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={isCreating || users.length === 0}
          className="cursor-pointer rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          onClick={() => {
            const el = formRef.current;
            if (!el) return;
            startCreate(async () => {
              setCreateError(null);
              const r = await createProjectFromForm(new FormData(el));
              if (r.ok) {
                router.push(`/projektai/${r.id}`);
                router.refresh();
              } else {
                setCreateError(r.error);
              }
            });
          }}
        >
          {isCreating ? "Kuriama…" : "Patvirtinti ir sukurti projektą"}
        </button>
      </div>

      {isAutomatic ? (
        <p className="text-xs text-zinc-500">
          Kuriate tik kampanijos taisykles. Kandidatų sąrašas projekte bus dinaminis; fiksuota eilutė atsiranda tik paspaudus
          „Imti į darbą“.
        </p>
      ) : null}

      {createError ? <p className="text-sm text-red-600">{createError}</p> : null}

      {isAutomatic && preview && !preview.ok ? <p className="text-sm text-red-600">{preview.error}</p> : null}

      {isAutomatic && preview && preview.ok ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 text-sm">
          <div className="font-medium text-zinc-900">Peržiūra</div>
          <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-700">
            <li>
              Atitinkančių klientų: <span className="font-semibold tabular-nums">{preview.clientCount}</span>
            </li>
            <li>
              Bendra apyvarta istoriniame intervale (dabartiniai kandidatai):{" "}
              <span className="font-semibold">{formatMoney(preview.totalRevenue)}</span>
            </li>
          </ul>
          {preview.previewRows.length > 0 ? (
            <div className="mt-3">
              <ProjectCandidateCallList mode="preview" candidates={preview.previewRows} />
              {preview.clientCount > preview.previewRows.length ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Rodyti pirmos {preview.previewRows.length} eilutės iš {preview.clientCount}.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">Nėra klientų pagal kriterijus.</p>
          )}
        </div>
      ) : null}
    </form>
  );
}
