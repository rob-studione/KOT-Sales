import type { ReactNode } from "react";

/**
 * Analitikos modulio viršutinis blokas: pavadinimas, aprašymas, skirtukai.
 * Vienodi fontai, spalvos (gray-*), tarpai visiems /analitika* puslapiams.
 */
export function CrmAnalyticsHeader({
  title,
  description,
  tabs,
}: {
  title: string;
  description?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
      {description != null ? (
        <div className="mt-2 text-base leading-relaxed text-gray-600">{description}</div>
      ) : null}
      {tabs != null ? <div className="mt-6 min-w-0">{tabs}</div> : null}
    </header>
  );
}
