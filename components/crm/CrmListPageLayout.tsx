import type { ReactNode } from "react";

/**
 * List/kanban puslapių blokas — sutampa su „Aktyvūs klientai“ šablonu:
 * title (text-2xl) → description (mt-2) → controls (mt-4) → main (mt-4).
 */
export function CrmListPageIntro({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h2>
      {description != null ? (
        <div className="mt-2 text-sm leading-normal text-gray-600">{description}</div>
      ) : null}
    </div>
  );
}

/** 3: paieška, filtrai, rikiavimas, CTA ir kt. */
export function CrmListPageControls({ children }: { children: ReactNode }) {
  return <div className="mt-4 min-w-0">{children}</div>;
}

/** 4: lentelė, kanban ar kt. pagrindinis turinys. */
export function CrmListPageMain({ children }: { children: ReactNode }) {
  return <div className="mt-4 min-w-0">{children}</div>;
}
