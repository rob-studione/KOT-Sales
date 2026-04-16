-- Lost QA safe-mode activation: store baseline Gmail historyId to prevent backfill.

begin;

alter table public.gmail_mailboxes
  add column if not exists activation_history_id bigint null;

create index if not exists gmail_mailboxes_activation_history_id_idx
  on public.gmail_mailboxes (activation_history_id);

comment on column public.gmail_mailboxes.activation_history_id is
  'Lost QA safe mode: baseline Gmail historyId captured at activation. History sync must never start before this.';

commit;

