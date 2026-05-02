begin;

drop policy if exists "playbooks_authenticated_select" on public.playbooks;
drop policy if exists "playbook_nodes_authenticated_select" on public.playbook_nodes;
drop policy if exists "playbook_edges_authenticated_select" on public.playbook_edges;

commit;

