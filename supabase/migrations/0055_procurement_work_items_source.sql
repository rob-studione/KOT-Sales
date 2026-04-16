-- Viešųjų pirkimų sutartys → darbo eilutė (`source_type = procurement_contract`).

alter table public.project_work_items
  drop constraint if exists project_work_items_source_type_check;

alter table public.project_work_items
  add constraint project_work_items_source_type_check
  check (
    source_type is null
    or source_type in ('auto', 'manual_lead', 'linked_client', 'procurement_contract')
  );

comment on column public.project_work_items.source_type is
  'auto | manual_lead | linked_client | procurement_contract';

-- Vienas atviras darbas vienai sutarčiai: užbaigimo kodai turi būti „uždaryti“ indekse.
drop index if exists public.project_work_items_one_open_client;

create unique index project_work_items_one_open_client
  on public.project_work_items (project_id, client_key)
  where not (
    lower(trim(coalesce(result_status, ''))) in (
      'completed',
      'closed',
      'cancelled',
      'uždaryta',
      'lost',
      'neaktualus',
      'returned_to_candidates',
      'completion_sent_email',
      'completion_sent_commercial',
      'completion_relevant_as_needed',
      'completion_translations_not_relevant',
      'completion_other_provider',
      'completion_procurement_invite_participate',
      'completion_procurement_include_purchase',
      'completion_procurement_contact_failed',
      'completion_procurement_not_relevant',
      'completion_procurement_other'
    )
  );
