import type { ReactNode } from "react";

/** Vienas CRM darbo zonos standartas: plotis, centravimas, horizontalus padding. */
export const CRM_CONTENT_CONTAINER_CLASS = "w-full max-w-[2080px] mx-auto px-4";

export function CrmContentContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `${CRM_CONTENT_CONTAINER_CLASS} ${className}` : CRM_CONTENT_CONTAINER_CLASS}>
      {children}
    </div>
  );
}
