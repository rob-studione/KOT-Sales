"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewPlaybookButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/crm/playbooks", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !json.ok || !json.id) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      router.push(`/scenarijai/${json.id}/edit`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Klaida";
      window.alert(`Nepavyko sukurti scenarijaus: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm",
        busy ? "cursor-wait text-zinc-400" : "text-zinc-800 hover:bg-zinc-50",
      ].join(" ")}
      disabled={busy}
    >
      {busy ? "Kuriama…" : "Naujas scenarijus"}
    </button>
  );
}

