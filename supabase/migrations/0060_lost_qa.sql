-- Lost QA: Gmail thread ingestion + analysis storage (schema only; no RLS in this stage).

begin;

--1) Mailboxes configured for Lost label + Gmail watch metadata
create table if not exists public.gmail_mailboxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email_address text not null unique,
  google_user_id text null,
  is_active boolean not null default true,
  lost_label_id text not null,
  watch_topic_name text not null,
  watch_history_id bigint null,
  watch_expiration_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gmail_mailboxes is 'Lost QA: monitored Gmail mailbox + watch/Lost label ids.';

drop trigger if exists gmail_mailboxes_set_updated_at on public.gmail_mailboxes;
create or replace function public.gmail_mailboxes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gmail_mailboxes_set_updated_at
  before update on public.gmail_mailboxes
  for each row
  execute function public.gmail_mailboxes_touch_updated_at();

-- 2) Raw thread snapshots from Gmail
create table if not exists public.gmail_threads_raw (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.gmail_mailboxes (id) on delete cascade,
  gmail_thread_id text not null,
  gmail_history_id bigint null,
  subject text null,
  participants jsonb not null default '[]'::jsonb,
  message_count int not null default 0 check (message_count >= 0),
  last_message_at timestamptz null,
  has_lost_label boolean not null default false,
  raw_payload jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gmail_threads_raw_mailbox_thread_unique unique (mailbox_id, gmail_thread_id),
  constraint gmail_threads_raw_participants_is_array check (jsonb_typeof(participants) = 'array')
);

comment on table public.gmail_threads_raw is 'Lost QA: raw Gmail thread payload + denormalized fields.';

drop trigger if exists gmail_threads_raw_set_updated_at on public.gmail_threads_raw;
create or replace function public.gmail_threads_raw_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gmail_threads_raw_set_updated_at
  before update on public.gmail_threads_raw
  for each row
  execute function public.gmail_threads_raw_touch_updated_at();

create index if not exists gmail_threads_raw_mailbox_last_msg_idx
  on public.gmail_threads_raw (mailbox_id, last_message_at desc nulls last);

-- 3) Business "lost case" per thread
create table if not exists public.lost_cases (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.gmail_mailboxes (id) on delete cascade,
  gmail_thread_id text not null,
  gmail_thread_url text null,
  subject text null,
  client_email text null,
  client_name text null,
  assigned_agent_email text null,
  assigned_agent_name text null,
  first_message_at timestamptz null,
  last_message_at timestamptz null,
  lost_detected_at timestamptz not null,
  status text not null default 'pending_analysis',
  analysis_version int not null default 1 check (analysis_version >= 1),
  needs_reanalysis boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_cases_mailbox_thread_unique unique (mailbox_id, gmail_thread_id),
  constraint lost_cases_status_check check (
    status in (
      'pending_analysis',
      'analyzed',
      'reviewed',
      'feedback_sent',
      'closed'
    )
  )
);

comment on table public.lost_cases is 'Lost QA: one case per Gmail thread (normalized for review workflow).';

drop trigger if exists lost_cases_set_updated_at on public.lost_cases;
create or replace function public.lost_cases_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lost_cases_set_updated_at
  before update on public.lost_cases
  for each row
  execute function public.lost_cases_touch_updated_at();

create index if not exists lost_cases_mailbox_lost_detected_idx
  on public.lost_cases (mailbox_id, lost_detected_at desc);

create index if not exists lost_cases_status_lost_detected_idx
  on public.lost_cases (status, lost_detected_at desc);

create index if not exists lost_cases_agent_lost_detected_idx
  on public.lost_cases (assigned_agent_email, lost_detected_at desc nulls last);

-- 4) Messages belonging to a lost case
create table if not exists public.lost_case_messages (
  id uuid primary key default gen_random_uuid(),
  lost_case_id uuid not null references public.lost_cases (id) on delete cascade,
  gmail_message_id text not null,
  message_index int not null check (message_index >= 0),
  sent_at timestamptz null,
  sender_email text null,
  sender_name text null,
  sender_role text not null,
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  snippet text null,
  body_plain text null,
  body_clean text null,
  is_inbound boolean not null,
  created_at timestamptz not null default now(),
  constraint lost_case_messages_case_message_unique unique (lost_case_id, gmail_message_id),
  constraint lost_case_messages_sender_role_check check (
    sender_role in ('client', 'agent', 'internal', 'system', 'unknown')
  ),
  constraint lost_case_messages_to_emails_is_array check (jsonb_typeof(to_emails) = 'array'),
  constraint lost_case_messages_cc_emails_is_array check (jsonb_typeof(cc_emails) = 'array')
);

comment on table public.lost_case_messages is 'Lost QA: normalized messages for a lost case.';

create index if not exists lost_case_messages_case_index_idx
  on public.lost_case_messages (lost_case_id, message_index);

-- 5) AI analysis rows (versioned by prompt_version)
create table if not exists public.lost_case_analysis (
  id uuid primary key default gen_random_uuid(),
  lost_case_id uuid not null references public.lost_cases (id) on delete cascade,
  model_name text not null,
  prompt_version int not null check (prompt_version >= 1),
  primary_reason text not null,
  secondary_reason text null,
  confidence numeric(4, 3) not null,
  client_intent text not null,
  deal_stage text not null,
  price_issue boolean not null,
  response_speed_issue boolean not null,
  response_quality_issue boolean not null,
  followup_issue boolean not null,
  qualification_issue boolean not null,
  competitor_mentioned boolean not null,
  scope_mismatch boolean not null,
  agent_mistakes jsonb not null default '[]'::jsonb,
  improvement_actions jsonb not null default '[]'::jsonb,
  evidence_quotes jsonb not null default '[]'::jsonb,
  thread_summary text not null,
  manager_feedback_draft text not null,
  analysis_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_case_analysis_case_prompt_unique unique (lost_case_id, prompt_version),
  constraint lost_case_analysis_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint lost_case_analysis_primary_reason_check check (
    primary_reason in (
      'price_too_high',
      'slow_response',
      'poor_response_quality',
      'missing_followup',
      'client_not_qualified',
      'client_went_silent',
      'competitor_selected',
      'scope_mismatch',
      'internal_mistake',
      'timeline_not_fit',
      'other'
    )
  ),
  constraint lost_case_analysis_secondary_reason_check check (
    secondary_reason is null
    or secondary_reason in (
      'price_too_high',
      'slow_response',
      'poor_response_quality',
      'missing_followup',
      'client_not_qualified',
      'client_went_silent',
      'competitor_selected',
      'scope_mismatch',
      'internal_mistake',
      'timeline_not_fit',
      'other'
    )
  ),
  constraint lost_case_analysis_client_intent_check check (client_intent in ('high', 'medium', 'low')),
  constraint lost_case_analysis_deal_stage_check check (
    deal_stage in (
      'new_inquiry',
      'quoted',
      'followup',
      'negotiation',
      'late_stage',
      'unknown'
    )
  ),
  constraint lost_case_analysis_agent_mistakes_is_array check (jsonb_typeof(agent_mistakes) = 'array'),
  constraint lost_case_analysis_improvement_actions_is_array check (jsonb_typeof(improvement_actions) = 'array'),
  constraint lost_case_analysis_evidence_quotes_is_array check (jsonb_typeof(evidence_quotes) = 'array')
);

comment on table public.lost_case_analysis is 'Lost QA: LLM output + structured flags (one row per prompt_version).';

drop trigger if exists lost_case_analysis_set_updated_at on public.lost_case_analysis;
create or replace function public.lost_case_analysis_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lost_case_analysis_set_updated_at
  before update on public.lost_case_analysis
  for each row
  execute function public.lost_case_analysis_touch_updated_at();

create or replace function public.lost_case_analysis_enforce_agent_mistakes_allowed()
returns trigger
language plpgsql
as $$
declare
  el text;
begin
  if jsonb_typeof(new.agent_mistakes) <> 'array' then
    raise exception 'lost_case_analysis.agent_mistakes must be a JSON array';
  end if;

  for el in select * from jsonb_array_elements_text(coalesce(new.agent_mistakes, '[]'::jsonb))
  loop
    if el not in (
      'did_not_answer_question',
      'unclear_pricing',
      'slow_first_response',
      'slow_followup',
      'weak_value_positioning',
      'too_generic',
      'did_not_handle_objection',
      'qualification_missing',
      'tone_issue',
      'process_explanation_missing'
    ) then
      raise exception 'lost_case_analysis.agent_mistakes: invalid value %', el;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists lost_case_analysis_enforce_agent_mistakes on public.lost_case_analysis;
create trigger lost_case_analysis_enforce_agent_mistakes
  before insert or update on public.lost_case_analysis
  for each row
  execute function public.lost_case_analysis_enforce_agent_mistakes_allowed();

create index if not exists lost_case_analysis_lost_case_id_idx
  on public.lost_case_analysis (lost_case_id);

create index if not exists lost_case_analysis_primary_reason_idx
  on public.lost_case_analysis (primary_reason);

-- 6) Aggregated daily rollups
create table if not exists public.lost_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  summary_date date not null,
  mailbox_id uuid null references public.gmail_mailboxes (id) on delete cascade,
  total_lost_count int not null check (total_lost_count >= 0),
  price_issue_count int not null check (price_issue_count >= 0),
  response_speed_issue_count int not null check (response_speed_issue_count >= 0),
  response_quality_issue_count int not null check (response_quality_issue_count >= 0),
  followup_issue_count int not null check (followup_issue_count >= 0),
  qualification_issue_count int not null check (qualification_issue_count >= 0),
  competitor_count int not null check (competitor_count >= 0),
  scope_mismatch_count int not null check (scope_mismatch_count >= 0),
  top_reasons jsonb not null default '[]'::jsonb,
  top_agents jsonb not null default '[]'::jsonb,
  priority_cases jsonb not null default '[]'::jsonb,
  manager_summary text not null,
  team_action_points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint lost_daily_summaries_date_mailbox_unique unique (summary_date, mailbox_id),
  constraint lost_daily_summaries_top_reasons_is_array check (jsonb_typeof(top_reasons) = 'array'),
  constraint lost_daily_summaries_top_agents_is_array check (jsonb_typeof(top_agents) = 'array'),
  constraint lost_daily_summaries_priority_cases_is_array check (jsonb_typeof(priority_cases) = 'array'),
  constraint lost_daily_summaries_team_action_points_is_array check (jsonb_typeof(team_action_points) = 'array')
);

comment on table public.lost_daily_summaries is 'Lost QA: daily aggregates (per mailbox or global when mailbox_id is null).';

create index if not exists lost_daily_summaries_summary_date_idx
  on public.lost_daily_summaries (summary_date desc);

-- 7) Manager review / feedback tracking
create table if not exists public.lost_manager_reviews (
  id uuid primary key default gen_random_uuid(),
  lost_case_id uuid not null references public.lost_cases (id) on delete cascade,
  reviewed_by uuid not null,
  ai_verdict_correct boolean null,
  manager_final_reason text null,
  manager_comment text null,
  feedback_sent_to text null,
  feedback_sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lost_manager_reviews is 'Lost QA: manager review of AI output and feedback lifecycle.';

drop trigger if exists lost_manager_reviews_set_updated_at on public.lost_manager_reviews;
create or replace function public.lost_manager_reviews_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lost_manager_reviews_set_updated_at
  before update on public.lost_manager_reviews
  for each row
  execute function public.lost_manager_reviews_touch_updated_at();

create index if not exists lost_manager_reviews_lost_case_id_idx
  on public.lost_manager_reviews (lost_case_id);

commit;
