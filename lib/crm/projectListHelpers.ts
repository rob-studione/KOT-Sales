/** Bendri projektų sąrašo skaičiavimai (UI ir puslapiai). */

export type ProjectListRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  sort_order?: number | null;
  owner_user_id: string | null;
  deleted_at?: string | null;
  project_work_items?: { count: number }[] | null;
};

export function projectWorkItemCount(p: ProjectListRow): number {
  const raw = p.project_work_items;
  if (!raw || !Array.isArray(raw) || raw.length === 0) return 0;
  const n = Number((raw[0] as { count?: number }).count);
  return Number.isFinite(n) ? n : 0;
}
