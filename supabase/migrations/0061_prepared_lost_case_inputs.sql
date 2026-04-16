-- Lost QA Stage 3: deterministic AI-ready prepared input per case (no OpenAI in this migration).

begin;

create table if not exists public.prepared_lost_case_inputs (
  id uuid primary key default gen_random_uuid(),
  lost_case_id uuid not null references public.lost_cases (id) on delete cascade,
  preparation_version int not null default 1 check (preparation_version >= 1),
  source_message_count int not null check (source_message_count >= 0),
  selected_message_count int not null check (selected_message_count >= 0),
  prepared_payload jsonb not null,
  prepared_text text not null,
  prepared_hash text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prepared_lost_case_inputs_case_version_unique unique (lost_case_id, preparation_version),
  constraint prepared_lost_case_inputs_payload_is_object check (jsonb_typeof(prepared_payload) = 'object')
);

comment on table public.prepared_lost_case_inputs is 'Lost QA Stage 3: packaged thread text + metadata for OpenAI (Stage 4).';

drop trigger if exists prepared_lost_case_inputs_set_updated_at on public.prepared_lost_case_inputs;
create or replace function public.prepared_lost_case_inputs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger prepared_lost_case_inputs_set_updated_at
  before update on public.prepared_lost_case_inputs
  for each row
  execute function public.prepared_lost_case_inputs_touch_updated_at();

create index if not exists prepared_lost_case_inputs_lost_case_id_idx
  on public.prepared_lost_case_inputs (lost_case_id);

create index if not exists prepared_lost_case_inputs_is_current_idx
  on public.prepared_lost_case_inputs (is_current);

create index if not exists prepared_lost_case_inputs_prepared_hash_idx
  on public.prepared_lost_case_inputs (prepared_hash);

commit;
