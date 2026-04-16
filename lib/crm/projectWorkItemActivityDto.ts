export type ProjectWorkItemActivityDto = {
  id: string;
  work_item_id: string;
  occurred_at: string;
  action_type: string;
  call_status: string;
  next_action: string;
  next_action_date: string | null;
  comment: string;
};

export function normalizeActivityRow(r: Record<string, unknown>): ProjectWorkItemActivityDto {
  return {
    id: String(r.id),
    work_item_id: String(r.work_item_id),
    occurred_at: String(r.occurred_at ?? ""),
    action_type: String(r.action_type ?? "call"),
    call_status: String(r.call_status ?? ""),
    next_action: String(r.next_action ?? ""),
    next_action_date:
      r.next_action_date && typeof r.next_action_date === "string"
        ? r.next_action_date.slice(0, 10)
        : null,
    comment: String(r.comment ?? ""),
  };
}
