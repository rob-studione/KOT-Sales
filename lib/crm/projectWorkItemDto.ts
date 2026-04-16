export type ProjectWorkItemDto = {
  id: string;
  /** Kilmė paėmimui; seni įrašai gali būti null. */
  source_type: "auto" | "manual_lead" | "linked_client" | "procurement_contract" | null;
  source_id: string | null;
  client_key: string;
  client_identifier_display: string;
  client_name_snapshot: string;
  assigned_to: string;
  picked_at: string;
  snapshot_order_count: number;
  snapshot_revenue: number;
  snapshot_last_invoice_date: string;
  snapshot_priority: number;
  call_status: string;
  next_action: string;
  next_action_date: string | null;
  comment: string;
  result_status: string;
};
