-- Per-proposal visibility of catalog lines. Master catalog is unchanged.

begin;

alter table public.commercial_proposal_lines
  add column if not exists included boolean not null default true;

comment on column public.commercial_proposal_lines.included is
  'Ar eilutė įtraukiama į šį pasiūlymą ir PDF. Kainynas nekeičiamas.';

create index if not exists commercial_proposal_lines_included_idx
  on public.commercial_proposal_lines (proposal_id, category, sort_order)
  where included = true;

notify pgrst, 'reload schema';

commit;
