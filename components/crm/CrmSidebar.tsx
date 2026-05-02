"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { fetchPublicBuildInfo, formatDeploymentUpdatedAt, getPublicBuildInfo } from "@/lib/buildInfo";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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
  ChevronRight,
  GitBranch,
  Mic,
  Wrench,
} from "lucide-react";

type SectionId = "analitika" | "klientai" | "projektai" | "irankiai" | "nustatymai";

type NavChild = {
  href: string;
  label: string;
  adminOnly?: boolean;
  separatorBefore?: boolean;
  aiBadge?: boolean;
};

const analitikaChildren: NavChild[] = [
  { href: "/analitika/kpi", label: "Vadybininkų KPI", adminOnly: true },
  { href: "/analitika/lost-qa", label: "Lost QA", adminOnly: true },
];

const klientaiChildren: NavChild[] = [
  { href: "/klientai", label: "Klientai" },
  { href: "/klientai/saskaitos", label: "Sąskaitos" },
];

const settingsChildren: NavChild[] = [
  { href: "/nustatymai/bendri", label: "Bendri", adminOnly: true },
  { href: "/nustatymai/paskyros", label: "Paskyros", adminOnly: true },
  { href: "/nustatymai/lost-qa", label: "Lost QA", adminOnly: true },
  { href: "/nustatymai/podcastai-ai", label: "Podcastai (AI)", adminOnly: true },
];

const irankiaiChildren: NavChild[] = [
  { href: "/scenarijai", label: "Scenarijai" },
  { href: "/irankiai/podcastai", label: "Podcastai", aiBadge: true },
];

function settingsIconForHref(href: string): LucideIcon {
  if (href === "/nustatymai/paskyros") return Users;
  if (href === "/nustatymai/bendri") return Sliders;
  if (href === "/nustatymai/kpi") return Target;
  if (href === "/nustatymai/lost-qa") return FileSearch;
  if (href === "/nustatymai/podcastai-ai") return Mic;
  return Settings;
}

function SidebarIcon({
  icon: Icon,
  active,
}: {
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Icon
      size={18}
      strokeWidth={1.5}
      className={active ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"}
      aria-hidden
    />
  );
}

function SidebarIconSlot({ icon, active }: { icon: LucideIcon; active: boolean }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className="inline-block h-[18px] w-[18px] shrink-0" aria-hidden />;
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
  if (href === "/irankiai/podcastai") return Mic;
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

function sectionIsRouteActive(section: SectionId, pathname: string): boolean {
  return activeSectionForPath(pathname) === section;
}

function filterChildren(list: NavChild[], isAdmin?: boolean) {
  return list.filter((c) => !c.adminOnly || Boolean(isAdmin));
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

export function CrmSidebar({ isAdmin }: { isAdmin?: boolean }) {
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

  const [activeProjects, setActiveProjects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const supabase = createSupabaseBrowserClient();
        const base = supabase.from("projects");
        const first = await base
          .select("id,name,status,deleted_at,created_at,sort_order")
          .eq("status", "active")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });

        let data: Array<{ id: string; name: string | null }> = [];
        if (first.error) {
          const msg = String(first.error.message ?? "");
          const missingDeletedAt =
            msg.includes("deleted_at") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));
          const missingSortOrder =
            msg.includes("sort_order") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("42703"));

          if (missingSortOrder) {
            const retry = await base
              .select("id,name,status,deleted_at,created_at")
              .eq("status", "active")
              .order("created_at", { ascending: false });
            if (retry.error) return;
            const rows = (retry.data ?? []) as Array<{ id?: unknown; name?: unknown; deleted_at?: unknown }>;
            data = rows.filter((r) => r.deleted_at == null) as Array<{ id: string; name: string | null }>;
          } else if (missingDeletedAt) {
            const retry = await base
              .select("id,name,status,created_at,sort_order")
              .eq("status", "active")
              .order("sort_order", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: false });
            if (retry.error) return;
            data = (retry.data ?? []) as Array<{ id: string; name: string | null }>;
          } else {
            return;
          }
        } else {
          const rows = (first.data ?? []) as Array<{ id: string; name: string | null; deleted_at?: unknown }>;
          data = rows.filter((r) => r.deleted_at == null).map((r) => ({ id: r.id, name: r.name ?? null }));
        }

        const items = (data ?? [])
          .map((r) => ({
            id: String(r.id ?? ""),
            name: String(r.name ?? "").trim(),
          }))
          .filter((p) => Boolean(p.id) && Boolean(p.name));

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

  const projektaiChildren: NavChild[] = useMemo(
    () => activeProjects.map((p) => ({ href: `/projektai/${p.id}`, label: p.name })),
    [activeProjects]
  );

  const sections: {
    id: SectionId;
    label: string;
    icon: LucideIcon;
    children: NavChild[];
  }[] = useMemo(
    () => {
      const list: { id: SectionId; label: string; icon: LucideIcon; children: NavChild[] }[] = [
        { id: "analitika", label: "Analitika", icon: BarChart3, children: filterChildren(analitikaChildren, isAdmin) },
        { id: "klientai", label: "Klientai", icon: Users, children: klientaiChildren },
        { id: "projektai", label: "Projektai", icon: Folder, children: projektaiChildren },
        { id: "irankiai", label: "Įrankiai", icon: Wrench, children: irankiaiChildren },
        {
          id: "nustatymai",
          label: "Nustatymai",
          icon: Settings,
          children: filterChildren(settingsChildren, isAdmin),
        },
      ];
      return list.filter((s) => s.id === "projektai" || s.children.length > 0);
    },
    [isAdmin, projektaiChildren]
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
  const itemInactive = "text-zinc-600 hover:bg-zinc-50 hover:text-[#7C4A57]";
  const itemActive = "bg-zinc-100/90 text-[#7C4A57] font-medium";
  const headerBase =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors";

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-zinc-200/80 bg-white">
      <nav className="flex flex-col gap-0.5 px-2 py-3" aria-label="Pagrindinis meniu">
        <div className="pb-1.5">
          <Link
            href="/dashboard"
            onClick={() => setOpenSectionId(null)}
            className={`${itemBase} ${pathname === "/dashboard" ? itemActive : itemInactive}`}
          >
            {pathname === "/dashboard" ? (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-[#7C4A57]" aria-hidden />
            ) : null}
            <SidebarIconSlot icon={LayoutDashboard} active={pathname === "/dashboard"} />
            <span className="truncate">Apžvalga</span>
          </Link>
        </div>

        {sections.map(({ id, label, icon: SectionIcon, children }) => {
          const expanded = openSectionId === id;
          const routeActive = sectionIsRouteActive(id, pathname);

          return (
            <div key={id} className="rounded-lg">
              <div
                className={[
                  headerBase,
                  SUBMENU_MS,
                  routeActive ? "bg-zinc-100/80 text-[#7C4A57]" : "text-zinc-600 hover:bg-zinc-50 hover:text-[#7C4A57]",
                ].join(" ")}
              >
                {id === "projektai" ? (
                  <>
                    <Link
                      href="/projektai"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none"
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
                      className="shrink-0 rounded-md p-1.5 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15"
                    >
                      <ChevronRight
                        size={16}
                        strokeWidth={1.75}
                        className={[
                          "text-zinc-400 transition-transform",
                          SUBMENU_MS,
                          SUBMENU_EASE,
                          expanded ? "rotate-90" : "rotate-0",
                        ].join(" ")}
                        aria-hidden
                      />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleSection(id)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none"
                    >
                      <SidebarIconSlot icon={SectionIcon} active={routeActive} />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection(id);
                      }}
                      aria-expanded={expanded}
                      className="shrink-0 rounded-md p-1.5 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15"
                    >
                      <ChevronRight
                        size={16}
                        strokeWidth={1.75}
                        className={[
                          "text-zinc-400 transition-transform",
                          SUBMENU_MS,
                          SUBMENU_EASE,
                          expanded ? "rotate-90" : "rotate-0",
                        ].join(" ")}
                        aria-hidden
                      />
                    </button>
                  </>
                )}
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
                      id === "projektai" ? "pl-0" : id === "irankiai" ? "pl-3" : "pl-1",
                    ].join(" ")}
                  >
                      {children.map(({ href, label: childLabel, separatorBefore, aiBadge }) => {
                        const active =
                          id === "klientai"
                            ? klientaiLinkActive(pathname, href)
                            : id === "projektai"
                              ? projektaiLinkActive(pathname, href)
                              : linkActive(pathname, href);
                        const icon = id === "nustatymai" ? settingsIconForHref(href) : iconForHref(href);
                        return (
                          <Fragment key={href}>
                            {separatorBefore ? (
                              <li className="list-none px-2.5 py-1" aria-hidden>
                                <div className="h-px bg-zinc-200/70" />
                              </li>
                            ) : null}
                            <li>
                              {id === "projektai" ? (
                                <Link
                                  href={href}
                                  className={`${itemBase} ${active ? itemActive : itemInactive} relative px-2 gap-1.5`}
                                >
                                  <span className="relative inline-block h-[18px] w-[18px] shrink-0" aria-hidden>
                                    <span
                                      className={[
                                        "absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                                        active ? "bg-zinc-400/80" : "bg-zinc-300/70",
                                      ].join(" ")}
                                    />
                                  </span>
                                  <ProjectSidebarLabel text={childLabel} />
                                </Link>
                              ) : (
                                <Link href={href} className={`${itemBase} ${active ? itemActive : itemInactive}`}>
                                  {active ? (
                                    <span
                                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-[#7C4A57]"
                                      aria-hidden
                                    />
                                  ) : null}
                                  <SidebarIconSlot icon={icon} active={active} />
                                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                    <span className="truncate">{childLabel}</span>
                                    {aiBadge ? (
                                      <span
                                        className="shrink-0 rounded border border-violet-200 bg-violet-50 px-1 py-0 text-[9px] font-semibold uppercase leading-none tracking-wide text-violet-700"
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
        <div className="mt-auto border-t border-zinc-200/70 px-4 py-3 text-[11px] text-zinc-400/80">{footerText}</div>
      ) : null}
    </aside>
  );
}
