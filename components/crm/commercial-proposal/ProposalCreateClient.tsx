"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCommercialProposalAction,
  searchProposalRecipientsAction,
  type ProposalRecipientOption,
} from "@/lib/crm/commercialProposalActions";
import { commercialProposalPath } from "@/lib/crm/commercialProposalPaths";
import type { CpRecipientType } from "@/lib/commercialProposal/types";

export function ProposalCreateClient() {
  const router = useRouter();
  const [recipientType, setRecipientType] = useState<CpRecipientType>("client");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProposalRecipientOption[]>([]);
  const [selected, setSelected] = useState<ProposalRecipientOption | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setSelected(null);
    setRecipientName("");
    setResults([]);
  }, [recipientType]);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      searchProposalRecipientsAction({ recipientType, query: q })
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Paieška nepavyko.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, recipientType, selected]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Gavėjas</h2>
        <div className="mt-3 flex gap-2">
          {(["client", "lead"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setRecipientType(type)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                recipientType === type ? "bg-[#7C4A57] text-white" : "border border-zinc-200 bg-white text-zinc-700",
              ].join(" ")}
            >
              {type === "client" ? "Klientas" : "Lead"}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium text-zinc-600">
            {recipientType === "client" ? "Ieškoti kliento" : "Ieškoti lead"}
          </span>
          <input
            value={selected ? selected.recipientName : query}
            onChange={(e) => {
              setSelected(null);
              setRecipientName("");
              setQuery(e.target.value);
            }}
            placeholder={recipientType === "client" ? "Įmonės pavadinimas arba kodas" : "Įmonė, kontaktas ar el. paštas"}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm"
          />
        </label>
        {searching ? <p className="mt-2 text-xs text-zinc-500">Ieškoma…</p> : null}
        {!selected && results.length > 0 ? (
          <ul className="mt-2 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
            {results.map((row) => (
              <li key={`${row.recipientType}-${row.recipientId}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-zinc-50"
                  onClick={() => {
                    setSelected(row);
                    setRecipientName(row.recipientName);
                    setQuery(row.recipientName);
                    setResults([]);
                  }}
                >
                  <div className="text-sm font-medium text-zinc-900">{row.recipientName}</div>
                  <div className="text-xs text-zinc-500">
                    {[row.contactName, row.email, row.phone, row.projectName].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {selected ? (
          <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
            <div>
              <span className="text-zinc-500">Įmonė:</span> {selected.recipientName}
            </div>
            {selected.contactName ? (
              <div>
                <span className="text-zinc-500">Kontaktas:</span> {selected.contactName}
              </div>
            ) : null}
            {selected.email ? (
              <div>
                <span className="text-zinc-500">El. paštas:</span> {selected.email}
              </div>
            ) : null}
            {selected.phone ? (
              <div>
                <span className="text-zinc-500">Telefonas:</span> {selected.phone}
              </div>
            ) : null}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-zinc-600">Gavėjo pavadinimas PDF</span>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Pakeitus pavadinimą, Kliento ar Lead įrašas nebus atnaujintas.
            </p>
          </div>
        ) : null}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={!selected || pending}
        className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
        onClick={() => {
          if (!selected) return;
          setError(null);
          start(async () => {
            const res = await createCommercialProposalAction({
              recipientType: selected.recipientType,
              recipientId: selected.recipientId,
              recipientName,
            });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push(commercialProposalPath(res.id));
          });
        }}
      >
        Sukurti juodraštį
      </button>
    </div>
  );
}
