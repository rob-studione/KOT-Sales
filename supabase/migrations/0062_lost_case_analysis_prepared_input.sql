-- Lost QA Stage 4: link analysis row to the prepared input version that was analyzed.

begin;

alter table public.lost_case_analysis
  add column if not exists prepared_input_id uuid null
    references public.prepared_lost_case_inputs (id) on delete set null;

create index if not exists lost_case_analysis_prepared_input_id_idx
  on public.lost_case_analysis (prepared_input_id);

commit;
