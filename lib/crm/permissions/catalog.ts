export const PERMISSION_GROUPS = {
  navigation: "Navigacija",
  analytics: "Analitika",
  tools: "Įrankiai",
  projects: "Projektai",
  settings: "Nustatymai",
} as const;

export type PermissionGroupKey = keyof typeof PERMISSION_GROUPS;

export const PERMISSION_DEFINITIONS = [
  { key: "nav.dashboard", label: "Apžvalga", group: "navigation" },
  { key: "nav.analytics.kpi", label: "Vadybininkų KPI", group: "navigation" },
  { key: "nav.analytics.lost_qa", label: "Lost QA", group: "navigation" },
  { key: "nav.clients", label: "Klientai", group: "navigation" },
  { key: "nav.clients.invoices", label: "Sąskaitos", group: "navigation" },
  { key: "nav.projects", label: "Projektai", group: "navigation" },
  { key: "nav.tools.playbooks", label: "Scenarijai", group: "navigation" },
  { key: "nav.tools.translator_search", label: "Vertėjų paieška", group: "navigation" },
  { key: "nav.tools.podcasts", label: "Podcastai", group: "navigation" },
  { key: "nav.tools.commercial_proposals", label: "Komerciniai pasiūlymai", group: "navigation" },
  { key: "nav.settings", label: "Nustatymų skiltis", group: "navigation" },

  { key: "analytics.kpi.edit_targets", label: "KPI tikslų redagavimas", group: "analytics" },

  { key: "tools.translator_search.run", label: "Paleisti vertėjų paiešką", group: "tools" },
  { key: "tools.translator_search.review", label: "Tvirtinti / atmesti vertėjų kandidatus", group: "tools" },
  { key: "tools.podcasts.refresh", label: "Atnaujinti podcastų įžvalgas", group: "tools" },

  { key: "projects.create", label: "Kurti projektus", group: "projects" },
  { key: "projects.manage", label: "Valdyti projektų nustatymus", group: "projects" },

  { key: "settings.general", label: "Bendri nustatymai", group: "settings" },
  { key: "settings.accounts", label: "Paskyrų valdymas", group: "settings" },
  { key: "settings.roles", label: "Rolių valdymas", group: "settings" },
  { key: "settings.lost_qa", label: "Lost QA nustatymai", group: "settings" },
  { key: "settings.podcasts_ai", label: "Podcastai (AI) nustatymai", group: "settings" },
  { key: "settings.commercial_proposals", label: "Komerciniai pasiūlymai", group: "settings" },
] as const satisfies ReadonlyArray<{ key: string; label: string; group: PermissionGroupKey }>;

export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((x) => x.key) as PermissionKey[];

export const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return PERMISSION_KEY_SET.has(String(value ?? ""));
}

export type PermissionGroup = {
  key: PermissionGroupKey;
  label: string;
  items: Array<{ key: PermissionKey; label: string }>;
};

export function buildPermissionGroups(): PermissionGroup[] {
  const out: PermissionGroup[] = [];
  (Object.keys(PERMISSION_GROUPS) as PermissionGroupKey[]).forEach((groupKey) => {
    const items = PERMISSION_DEFINITIONS.filter((x) => x.group === groupKey).map((x) => ({
      key: x.key,
      label: x.label,
    })) as Array<{ key: PermissionKey; label: string }>;
    out.push({ key: groupKey, label: PERMISSION_GROUPS[groupKey], items });
  });
  return out;
}

export const ADMIN_DEFAULT_PERMISSIONS = [...PERMISSION_KEYS] as PermissionKey[];

export const SALES_DEFAULT_PERMISSIONS: PermissionKey[] = [
  "nav.dashboard",
  "nav.analytics.kpi",
  "nav.clients",
  "nav.clients.invoices",
  "nav.projects",
  "nav.tools.playbooks",
  "nav.tools.translator_search",
  "nav.tools.podcasts",
  "nav.tools.commercial_proposals",
];
