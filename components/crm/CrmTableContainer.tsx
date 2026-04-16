import type { ReactNode } from "react";

/** Bendras klientų lentelių plotis (kairėje, be mx-auto), sutampa su analitikos lentelėmis. */
export const CRM_TABLE_CONTAINER_CLASS = "w-full min-w-0 max-w-[1600px] ml-0";

export function CrmTableContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `${CRM_TABLE_CONTAINER_CLASS} ${className}` : CRM_TABLE_CONTAINER_CLASS}>
      {children}
    </div>
  );
}
