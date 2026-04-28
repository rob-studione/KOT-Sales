import Link from "next/link";
import { formatDate } from "@/lib/crm/format";
import type { CrmNotificationRow } from "@/lib/crm/notificationConstants";

export function ProjectProcurementNotifications({
  projectId,
  notifications,
}: {
  projectId: string;
  notifications: CrmNotificationRow[];
}) {
  if (notifications.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm" aria-label="Projekto pranešimai">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Jūsų pranešimai šiame projekte</h2>
      <ul className="mt-3 space-y-2">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={`rounded-lg border px-3 py-2 text-sm ${n.is_read ? "border-zinc-100 bg-zinc-50/50 text-zinc-700" : "border-gray-200 bg-gray-50 text-zinc-900"}`}
          >
            <p className={n.is_read ? "" : "font-medium"}>{n.message}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatDate(n.created_at.slice(0, 10))}
              {" · "}
              <Link href={`/projektai/${projectId}?tab=sutartys`} className="font-medium text-zinc-700 underline-offset-2 hover:underline">
                Atverti sutartis
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
