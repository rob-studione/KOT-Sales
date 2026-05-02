begin;

alter table public.playbooks
  add column if not exists start_node_id uuid null
  references public.playbook_nodes (id) on delete set null;

comment on column public.playbooks.start_node_id is
  'Optional entry node for runner; if null or invalid, first node by created_at is used.';

commit;
