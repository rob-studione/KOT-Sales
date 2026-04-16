"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { renameProjectNameAction } from "@/lib/crm/projectActions";

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M16.86 3.49a2.1 2.1 0 0 1 2.97 0l.68.68a2.1 2.1 0 0 1 0 2.97l-9.9 9.9a1 1 0 0 1-.43.25l-4.2 1.2a.9.9 0 0 1-1.11-1.11l1.2-4.2a1 1 0 0 1 .25-.43l9.9-9.9ZM18.2 4.83l-9.55 9.55-.76 2.65 2.65-.76 9.55-9.55a.8.8 0 0 0 0-1.13l-.68-.68a.8.8 0 0 0-1.13 0Z"
      />
    </svg>
  );
}

export function EditableProjectName({
  projectId,
  initialName,
  canEdit = true,
  maxLength = 100,
}: {
  projectId: string;
  initialName: string;
  canEdit?: boolean;
  maxLength?: number;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setName(initialName);
    if (!isEditing) setDraft(initialName);
  }, [initialName, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const t = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [isEditing]);

  function validate(raw: string): { ok: true; value: string } | { ok: false; error: string } {
    const v = raw.trim();
    if (!v) return { ok: false, error: "Pavadinimas negali būti tuščias." };
    if (v.length > maxLength) return { ok: false, error: `Maks. ${maxLength} simbolių.` };
    return { ok: true, value: v };
  }

  function cancel() {
    setError(null);
    setSaved(false);
    setDraft(name);
    setIsEditing(false);
  }

  function commit(nextRaw: string) {
    if (!canEdit || isPending) return;
    const v = validate(nextRaw);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    const next = v.value;
    if (next === name) {
      setError(null);
      setSaved(false);
      setIsEditing(false);
      return;
    }

    setError(null);
    setSaved(false);

    const prev = name;
    setName(next); // optimistic
    setDraft(next);
    setIsEditing(false);

    startTransition(async () => {
      const res = await renameProjectNameAction(projectId, next);
      if (!res.ok) {
        setName(prev);
        setDraft(prev);
        setError(res.error);
        return;
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    });
  }

  if (!canEdit) {
    return <h1 className="text-xl font-semibold text-zinc-900">{name}</h1>;
  }

  return (
    <div className="group flex items-center gap-2">
      {isEditing ? (
        <div className="min-w-0">
          <label htmlFor={inputId} className="sr-only">
            Projekto pavadinimas
          </label>
          <input
            id={inputId}
            ref={inputRef}
            value={draft}
            maxLength={maxLength}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(draft);
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="w-full min-w-[14rem] rounded-md border border-zinc-200 bg-white px-2 py-1 text-xl font-semibold text-zinc-900 shadow-sm outline-none ring-0 focus:border-zinc-300 focus:ring-2 focus:ring-zinc-900/10"
          />
          {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSaved(false);
              setDraft(name);
              setIsEditing(true);
            }}
            className="min-w-0 cursor-pointer text-left"
            aria-label="Pervadinti projektą"
          >
            <h1 className="truncate text-xl font-semibold text-zinc-900">{name}</h1>
          </button>
          <PencilIcon className="h-4 w-4 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />
          {saved ? <span className="text-xs text-emerald-700">Išsaugota</span> : null}
          {error && !saved ? <span className="text-xs text-red-600">{error}</span> : null}
        </>
      )}
    </div>
  );
}

