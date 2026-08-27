"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { fetchPublicBuildInfo, formatDeploymentUpdatedAt, getPublicBuildInfo } from "@/lib/buildInfo";
import { CRM_SIDEBAR_BG, CRM_SIDEBAR_WIDTH_PX } from "@/lib/crm/crmShellLayout";
import {
  fetchSidebarAutomaticCandidateCounts,
  type ProjectRulesRow,
} from "@/lib/crm/projectCandidateQuery";
import { effectiveProjectType } from "@/lib/crm/projectType";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ManagerObligationsSidebarItem } from "@/components/crm/manager-obligations/ManagerObligationsSidebarItem";
import { hasPermission } from "@/lib/crm/permissions/check";
import {
  BarChart3,
  LayoutDashboard,
  AlertCircle,
  Users,
  CheckCircle,
  XCircle,
  Folder,
  FileText,
  Settings,
  Sliders,
  Target,
  FileSearch,
  ChevronDown,
  GitBranch,
  Layers,
  Languages,
  Wrench,
} from "lucide-react";

type SectionId = "analitika" | "klientai" | "projektai" | "irankiai" | "nustatymai";

type NavChild = {
  href: string;
  label: string;
  permission?: string;
  separatorBefore?: boolean;
  aiBadge?: boolean;
  /** Unikalių auto-kandidatų skaičius (tik automatic projektai; 0 → nerodyti). */
  badgeCount?: number;
};

function formatSidebarBadgeCount(n: number): string {
  if (n > 999) return "999+";
  return String(n);
}

const analitikaChildren: NavChild[] = [
  { href: "/analitika/kpi", label: "Vadybininkų KPI", permission: "nav.analytics.kpi" },
  { href: "/analitika/lost-qa", label: "Lost QA", permission: "nav.analytics.lost_qa", aiBadge: true },
];

const klientaiChildren: NavChild[] = [
  { href: "/klientai", label: "Klientai", permission: "nav.clients" },
  { href: "/klientai/saskaitos", label: "Sąskaitos", permission: "nav.clients.invoices" },
];

const settingsChildren: NavChild[] = [
  { href: "/nustatymai/bendri", label: "Bendri", permission: "settings.general" },
  { href: "/nustatymai/paskyros", label: "Paskyros", permission: "settings.accounts" },
  { href: "/nustatymai/roles", label: "Rolės", permission: "settings.roles" },
  { href: "/nustatymai/lost-qa", label: "Lost QA", permission: "settings.lost_qa", aiBadge: true },
];

const irankiaiChildren: NavChild[] = [
  { href: "/scenarijai", label: "Scenarijai", permission: "nav.tools.playbooks" },
  { href: "/irankiai/verteju-paieska", label: "Vertėjų paieška", permission: "nav.tools.translator_search" },
  { href: "/irankiai/komerciniai-pasiulymai", label: "Komerciniai pasiūlymai", permission: "nav.tools.commercial_proposals" },
];

function settingsIconForHref(href: string): LucideIcon {
  if (href === "/nustatymai/paskyros") return Users;
  if (href === "/nustatymai/roles") return Layers;
  if (href === "/nustatymai/bendri") return Sliders;
  if (href === "/nustatymai/kpi") return Target;
  if (href === "/nustatymai/lost-qa") return FileSearch;
  return Settings;
}

const SIDEBAR_ICON_PX = 14;

function SidebarIcon({
  icon: Icon,
  active,
}: {
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Icon
      size={SIDEBAR_ICON_PX}
      strokeWidth={1.5}
      className={active ? "text-white" : "text-white/65 group-hover:text-white"}
      aria-hidden
    />
  );
}

function SidebarIconSlot({ icon, active }: { icon: LucideIcon; active: boolean }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span
        className="inline-block shrink-0"
        style={{ width: SIDEBAR_ICON_PX, height: SIDEBAR_ICON_PX }}
        aria-hidden
      />
    );
  }
  return <SidebarIcon icon={icon} active={active} />;
}

function iconForHref(href: string): LucideIcon {
  if (href === "/dashboard") return LayoutDashboard;
  if (href === "/analitika/kpi") return Target;
  if (href === "/analitika/lost-qa") return AlertCircle;
  if (href === "/klientai") return Users;
  if (href === "/klientai/aktyvus") return CheckCircle;
  if (href === "/klientai/prarasti") return XCircle;
  if (href === "/projektai") return Folder;
  if (href === "/scenarijai") return GitBranch;
  if (href === "/irankiai/verteju-paieska") return Languages;
  if (href === "/irankiai/komerciniai-pasiulymai") return FileText;
  if (href === "/klientai/saskaitos") return FileText;
  return Settings;
}

function linkActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function klientaiLinkActive(pathname: string, href: string): boolean {
  // Parent "Klientai" section stays active via `activeSectionForPath`.
  // Sub-item "Klientai" must be active only on the exact list route.
  if (href === "/klientai") return pathname === "/klientai";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function projektaiLinkActive(pathname: string, href: string): boolean {
  if (href === "/projektai") {
    return pathname.startsWith("/projektai");
  }
  return pathname === href;
}

function activeSectionForPath(pathname: string): SectionId | null {
  if (pathname.startsWith("/nustatymai")) return "nustatymai";
  if (pathname.startsWith("/irankiai")) return "irankiai";
  if (pathname.startsWith("/scenarijai")) return "irankiai";
  if (pathname.startsWith("/projektai")) return "projektai";
  if (pathname.startsWith("/klientai")) return "klientai";
  if (pathname.startsWith("/analitika")) return "analitika";
  return null;
}

function sectionRootHref(section: SectionId): string {
  if (section === "analitika") return "/analitika/kpi";
  if (section === "klientai") return "/klientai";
  if (section === "projektai") return "/projektai";
  if (section === "irankiai") return "/scenarijai";
  return "/nustatymai/bendri";
}

function sectionIsRouteActive(section: SectionId, pathname: string): boolean {
  return activeSectionForPath(pathname) === section;
}

function filterChildren(list: NavChild[], user?: { role: string; role_is_system?: boolean | null; permissionKeys?: string[] }) {
  return list.filter((c) => !c.permission || hasPermission(user ?? null, c.permission));
}

function ProjectSidebarLabel({ text }: { text: string }) {
  const raw = (text ?? "").trim();
  const words = useMemo(() => raw.split(/\s+/).filter(Boolean), [raw]);
  const isSingleWord = words.length <= 1;

  const boxRef = useRef<HTMLSpanElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState<string>(raw);

  useLayoutEffect(() => {
    if (isSingleWord) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(raw);
      return;
    }
    const box = boxRef.current;
    const meas = measureRef.current;
    if (!box || !meas) return;

    let raf = 0;
    const compute = () => {
      const max = box.getBoundingClientRect().width;
      if (!Number.isFinite(max) || max <= 0) return;

      let best = "";
      let acc = "";
      for (const w of words) {
        const next = acc ? `${acc} ${w}` : w;
        meas.textContent = next;
        const width = meas.getBoundingClientRect().width;
        if (width <= max) {
          best = next;
          acc = next;
        } else {
          break;
        }
      }
      setDisplay(best);
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [isSingleWord, raw, words]);

  if (isSingleWord) {
    // One word: allow classic ellipsis.
    return <span className="min-w-0 truncate">{raw}</span>;
  }

  return (
    <span ref={boxRef} className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap">
      <span className="block">{display}</span>
      <span ref={measureRef} className="pointer-events-none absolute -left-[9999px] top-0 whitespace-nowrap opacity-0" />
    </span>
  );
}

const SUBMENU_EASE = "ease-out";
const SUBMENU_MS = "duration-[180ms]";

export function CrmSidebar({
  user,
  obligationsUserId,
}: {
  user?: { role: string; role_is_system?: boolean | null; permissionKeys?: string[] } | null;
  obligationsUserId?: string | null;
}) {
  const pathname = usePathname();
  const routeSection = useMemo(() => activeSectionForPath(pathname), [pathname]);
  const [buildInfo, setBuildInfo] = useState(() => getPublicBuildInfo());

  useEffect(() => {
    const ac = new AbortController();
    fetchPublicBuildInfo(ac.signal)
      .then((v) => setBuildInfo(v))
      .catch(() => {
        // Ignore: keep env-derived values (or nulls) if endpoint isn't reachable yet.
      });
    return () => ac.abort();
  }, []);
  const footerText = useMemo(() => {
    const updatedAt = formatDeploymentUpdatedAt(buildInfo.deploymentCreatedAt, "Europe/Vilnius");
    if (updatedAt) return `Atnaujinta: ${updatedAt}`;
    if (buildInfo.buildDateIso) return `Atnaujinta: ${buildInfo.buildDateIso}`;
    return null;
  }, [buildInfo.buildDateIso, buildInfo.deploymentCreatedAt]);

  const [activeProjects, setActiveProjects] = useState<Array<{ id: string; name: string; rules?: ProjectRulesRow }>>([]);
  const [candidateCounts, setCandidateCounts] = useState<Record<string, number>>({});

  const kandidataiProjectId = useMemo(() => {
    const m = pathname.match(/^\/projektai\/([^/]+)\/kandidatai(?:\/|$)/);
    return m?.[1] ?? "";
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const supabase = createSupabaseBrowserClient();
        const base = supabase.from("projects");
        const fullSelect =
          "id,name,status,deleted_at,created_at,sort_order,project_type,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,candidates_require_business_id";
        const first = await base
          .select(fullSelect)
          .eq("status", "active")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });

        let rows: Record<string, unknown>[] = [];
        if (first.error) {
          const msg = String(first.error.message ?? "");
          const missingDeletedAt =
            msg.includes("deleted_at") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));
          const missingSortOrder =
            msg.includes("sort_order") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));
          const missingTypeOrFilters =
            (msg.includes("project_type") ||
              msg.includes("filter_date") ||
              msg.includes("candidates_require_business_id")) &&
            (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));

          if (missingSortOrder || missingTypeOrFilters) {
            const retry = await base
              .select(
                "id,name,status,deleted_at,created_at,project_type,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option"
              )
              .eq("status", "active")
              .order("created_at", { ascending: false });
            if (retry.error) {
              const basic = await base
                .select("id,name,status,deleted_at,created_at")
                .eq("status", "active")
                .order("created_at", { ascending: false });
              if (basic.error) return;
              rows = ((basic.data ?? []) as Record<string, unknown>[]).filter((r) => r.deleted_at == null);
            } else {
              rows = ((retry.data ?? []) as Record<string, unknown>[]).filter((r) => r.deleted_at == null);
            }
          } else if (missingDeletedAt) {
            const retry = await base
              .select(
                "id,name,status,created_at,sort_order,project_type,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,candidates_require_business_id"
              )
              .eq("status", "active")
              .order("sort_order", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: false });
            if (retry.error) return;
            rows = (retry.data ?? []) as Record<string, unknown>[];
          } else {
            return;
          }
        } else {
          rows = ((first.data ?? []) as Record<string, unknown>[]).filter((r) => r.deleted_at == null);
        }

        const items = rows
          .map((r) => {
            const id = String(r.id ?? "");
            const name = String(r.name ?? "").trim();
            if (!id || !name) return null;
            const rules: ProjectRulesRow = {
              id,
              project_type: r.project_type != null ? String(r.project_type) : null,
              filter_date_from: String(r.filter_date_from ?? "").slice(0, 10),
              filter_date_to: String(r.filter_date_to ?? "").slice(0, 10),
              min_order_count: Number(r.min_order_count ?? 1),
              inactivity_days: r.inactivity_days == null ? 90 : Number(r.inactivity_days),
              sort_option: String(r.sort_option ?? ""),
              candidates_require_business_id:
                r.candidates_require_business_id == null ? false : Boolean(r.candidates_require_business_id),
            };
            return { id, name, rules };
          })
          .filter((p): p is { id: string; name: string; rules: ProjectRulesRow } => p != null);

        if (!cancelled) setActiveProjects(items);
      } catch {
        // Ignore in local dev if env/session isn't ready.
      }
    }
    run();
    function onOrderChanged() {
      run();
    }
    window.addEventListener("projects:order-changed", onOrderChanged as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("projects:order-changed", onOrderChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function runCounts() {
      const autoRules = activeProjects
        .map((p) => p.rules)
        .filter((r): r is ProjectRulesRow => Boolean(r))
        .filter((r) => effectiveProjectType(r.project_type) === "automatic")
        .filter((r) => Boolean(r.filter_date_from) && Boolean(r.filter_date_to));
      if (autoRules.length === 0) {
        if (!cancelled) setCandidateCounts({});
        return;
      }
      try {
        const supabase = createSupabaseBrowserClient();
        const counts = await fetchSidebarAutomaticCandidateCounts(supabase, autoRules);
        if (!cancelled) setCandidateCounts(counts);
      } catch {
        // Ignore count failures in sidebar.
      }
    }
    runCounts();
    return () => {
      cancelled = true;
    };
    // kandidataiProjectId: refresh after opening/leaving Kandidatai (pick clears pool).
  }, [activeProjects, kandidataiProjectId]);

  const projektaiChildren: NavChild[] = useMemo(
    () =>
      activeProjects.map((p) => ({
        href: `/projektai/${p.id}`,
        label: p.name,
        badgeCount: candidateCounts[p.id],
      })),
    [activeProjects, candidateCounts]
  );

  const sections: {
    id: SectionId;
    label: string;
    icon: LucideIcon;
    children: NavChild[];
  }[] = useMemo(
    () => {
      const list: { id: SectionId; label: string; icon: LucideIcon; children: NavChild[] }[] = [
        { id: "analitika", label: "Analitika", icon: BarChart3, children: filterChildren(analitikaChildren, user ?? undefined) },
        { id: "klientai", label: "Klientai", icon: Users, children: filterChildren(klientaiChildren, user ?? undefined) },
        { id: "projektai", label: "Projektai", icon: Folder, children: hasPermission(user ?? null, "nav.projects") ? projektaiChildren : [] },
        { id: "irankiai", label: "Įrankiai", icon: Wrench, children: irankiaiChildren },
        {
          id: "nustatymai",
          label: "Nustatymai",
          icon: Settings,
          children: hasPermission(user ?? null, "nav.settings") ? filterChildren(settingsChildren, user ?? undefined) : [],
        },
      ];
      return list.filter((s) => s.id === "projektai" || s.children.length > 0);
    },
    [user, projektaiChildren]
  );

  const [openSectionId, setOpenSectionId] = useState<SectionId | null>(() => routeSection);

  useEffect(() => {
    // Active section (by URL) must always be expanded.
    // If we're on dashboard (no section), keep all sections collapsed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenSectionId(routeSection ?? null);
  }, [routeSection, sections]);

  const toggleSection = useCallback((id: SectionId) => {
    setOpenSectionId((prev) => {
      // Active route section cannot be collapsed.
      if (routeSection && id === routeSection) return routeSection;
      // Accordion: open the clicked section and close others.
      // Allow collapsing a non-active section back to the active one (or none on /dashboard).
      if (prev === id) return routeSection ?? null;
      return id;
    });
  }, [routeSection]);

  const itemBase =
    "group relative flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-sm leading-5 transition-colors duration-150";
  /** Poįrašiniai – šiek tiek mažesnis šriftas nei sekcija / „Apžvalga“. */
  const submenuItemBase =
    "group relative flex items-center gap-2 rounded-lg px-2.5 py-[6px] text-xs leading-4 transition-colors duration-150";
  const itemInactive = "text-white/90 hover:bg-white/10 hover:text-white";
  const itemActive = "bg-white/15 text-white font-medium";
  const headerBase =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors";

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-white/15"
      style={{ width: CRM_SIDEBAR_WIDTH_PX, backgroundColor: CRM_SIDEBAR_BG }}
    >
      <nav className="flex flex-col gap-0.5 px-2 pb-3 pt-4" aria-label="Pagrindinis meniu">
        <div className="pb-1.5">
          <Link
            href="/dashboard"
            onClick={() => setOpenSectionId(null)}
            className={`${itemBase} ${pathname === "/dashboard" ? itemActive : itemInactive}`}
          >
            {pathname === "/dashboard" ? (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-white" aria-hidden />
            ) : null}
            <SidebarIconSlot icon={LayoutDashboard} active={pathname === "/dashboard"} />
            <span className="truncate">Apžvalga</span>
          </Link>
        </div>

        {obligationsUserId ? (
          <ManagerObligationsSidebarItem
            userId={obligationsUserId}
            itemBase={itemBase}
            itemInactive={itemInactive}
          />
        ) : null}

        {sections.map(({ id, label, icon: SectionIcon, children }) => {
          const expanded = openSectionId === id;
          const routeActive = sectionIsRouteActive(id, pathname);

          return (
            <div key={id} className="rounded-lg">
              <div
                className={[
                  headerBase,
                  SUBMENU_MS,
                  routeActive ? "bg-white/12 text-white" : "text-white/90 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <>
                  <Link
                    href={sectionRootHref(id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-inherit focus:outline-none"
                  >
                    <SidebarIconSlot icon={SectionIcon} active={routeActive} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </Link>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection(id);
                    }}
                    aria-expanded={expanded}
                    className="shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                  >
                    <ChevronDown
                      size={SIDEBAR_ICON_PX}
                      strokeWidth={1.75}
                      className={[
                        "text-white/70 transition-transform",
                        SUBMENU_MS,
                        SUBMENU_EASE,
                        expanded ? "rotate-180" : "rotate-0",
                      ].join(" ")}
                      aria-hidden
                    />
                  </button>
                </>
              </div>

              <div
                className={[
                  "grid transition-[grid-template-rows] motion-reduce:transition-none",
                  SUBMENU_MS,
                  SUBMENU_EASE,
                  expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                ].join(" ")}
              >
                <div className="min-h-0 overflow-hidden">
                  <ul
                    className={[
                      "flex flex-col gap-0.5 pb-1.5 pt-0.5",
                      id === "irankiai" ? "pl-3" : "pl-1",
                    ].join(" ")}
                  >
                      {children.map(({ href, label: childLabel, separatorBefore, aiBadge, badgeCount }) => {
                        const active =
                          id === "klientai"
                            ? klientaiLinkActive(pathname, href)
                            : id === "projektai"
                              ? projektaiLinkActive(pathname, href)
                              : linkActive(pathname, href);
                        const icon = id === "nustatymai" ? settingsIconForHref(href) : iconForHref(href);
                        const showBadge = id === "projektai" && typeof badgeCount === "number" && badgeCount > 0;
                        return (
                          <Fragment key={href}>
                            {separatorBefore ? (
                              <li className="list-none px-2.5 py-1" aria-hidden>
                                <div className="h-px bg-white/20" />
                              </li>
                            ) : null}
                            <li>
                              {id === "projektai" ? (
                                <Link
                                  href={href}
                                  className={`${submenuItemBase} ${active ? itemActive : itemInactive} relative min-w-0`}
                                >
                                  <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                  <ProjectSidebarLabel text={childLabel} />
                                  {showBadge ? (
                                    <span
                                      className="ml-auto shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-white"
                                      title={`${badgeCount} kandidatų`}
                                    >
                                      {formatSidebarBadgeCount(badgeCount!)}
                                    </span>
                                  ) : null}
                                </Link>
                              ) : (
                                <Link href={href} className={`${submenuItemBase} ${active ? itemActive : itemInactive}`}>
                                  {active ? (
                                    <span
                                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-white"
                                      aria-hidden
                                    />
                                  ) : null}
                                  <SidebarIconSlot icon={icon} active={active} />
                                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                    <span className="truncate">{childLabel}</span>
                                    {aiBadge ? (
                                      <span
                                        className="shrink-0 rounded border border-white/35 bg-white/15 px-1 py-0 text-[9px] font-semibold uppercase leading-none tracking-wide text-white"
                                        title="AI"
                                      >
                                        AI
                                      </span>
                                    ) : null}
                                  </span>
                                </Link>
                              )}
                            </li>
                          </Fragment>
                        );
                      })}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {footerText ? (
        <div className="mt-auto border-t border-white/15 px-4 py-3 text-[11px] text-white/55">{footerText}</div>
      ) : null}
    </aside>
  );
}
