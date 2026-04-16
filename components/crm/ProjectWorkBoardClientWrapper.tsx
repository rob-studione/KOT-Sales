"use client";

import dynamic from "next/dynamic";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";

const ProjectWorkBoardDynamic = dynamic(
  () => import("./ProjectWorkBoard").then((m) => ({ default: m.ProjectWorkBoard })),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[min(70vh,calc(100vh-12rem))] animate-pulse rounded-xl border border-zinc-200/90 bg-zinc-50/50"
        aria-hidden
      />
    ),
  }
);

export type ProjectWorkBoardClientWrapperProps = {
  projectId: string;
  items: ProjectWorkItemDto[];
  activitiesByWorkItemId: Record<string, ProjectWorkItemActivityDto[]>;
  boardVariant?: "default" | "procurement";
};

export function ProjectWorkBoardClientWrapper(props: ProjectWorkBoardClientWrapperProps) {
  return <ProjectWorkBoardDynamic {...props} />;
}
