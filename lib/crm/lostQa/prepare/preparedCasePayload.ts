import "server-only";

import type { LostSenderRole } from "@/lib/crm/lostQaDb";

/** Strict JSON shape for Stage 4 OpenAI input (no extra top-level keys). */
export type PreparedMessageSignals = {
  pricing: boolean;
  timeline: boolean;
  competitor: boolean;
  objection: boolean;
  decision: boolean;
  scope: boolean;
  ghosting: boolean;
  low_value: boolean;
};

export type PreparedSelectedMessage = {
  message_id: string;
  message_index: number;
  sent_at: string | null;
  sender_role: LostSenderRole;
  sender_email: string | null;
  sender_name: string | null;
  is_inbound: boolean;
  signals: PreparedMessageSignals;
  clean_text: string;
};

export type PreparedLostCasePayload = {
  case_metadata: {
    lost_case_id: string;
    mailbox_id: string;
    gmail_thread_id: string;
    gmail_thread_url: string | null;
    subject: string | null;
    client_email: string | null;
    client_name: string | null;
    assigned_agent_email: string | null;
    assigned_agent_name: string | null;
    first_message_at: string | null;
    last_message_at: string | null;
  };
  thread_statistics: {
    source_message_count: number;
    selected_message_count: number;
    inbound_count: number;
    outbound_count: number;
  };
  selected_messages: PreparedSelectedMessage[];
};
