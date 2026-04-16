export const NOTIFICATION_TYPE_PROCUREMENT_DEADLINE = "procurement_deadline" as const;

export type CrmNotificationType = typeof NOTIFICATION_TYPE_PROCUREMENT_DEADLINE;

export type CrmNotificationRow = {
  id: string;
  user_id: string;
  project_id: string;
  contract_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};
