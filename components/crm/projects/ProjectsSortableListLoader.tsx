"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const ProjectsSortableList = dynamic(
  () => import("@/components/crm/projects/ProjectsSortableList").then((m) => ({ default: m.ProjectsSortableList })),
  {
    ssr: false,
    loading: () => (
      <ul className="flex flex-col gap-4" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_2px_12px_-4px_rgba(15,23,42,0.08)]">
              <div className="h-5 w-2/3 max-w-[420px] animate-pulse rounded bg-zinc-100" />
              <div className="mt-3 h-4 w-full max-w-[720px] animate-pulse rounded bg-zinc-100" />
              <div className="mt-6 h-px w-full bg-zinc-100" />
              <div className="mt-5 flex items-center justify-between gap-4">
                <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
                <div className="h-10 w-44 animate-pulse rounded-lg bg-zinc-100" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    ),
  }
);

export function ProjectsSortableListLoader(props: ComponentProps<typeof ProjectsSortableList>) {
  return <ProjectsSortableList {...props} />;
}
