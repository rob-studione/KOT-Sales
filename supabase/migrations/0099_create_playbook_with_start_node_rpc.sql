begin;

create or replace function public.create_playbook_with_start_node(
  p_name text default 'Naujas scenarijus',
  p_description text default null
)
returns table (
  playbook_id uuid,
  start_node_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  pb_id uuid;
  node_id uuid;
begin
  insert into public.playbooks (name, description)
  values (
    coalesce(nullif(trim(p_name), ''), 'Naujas scenarijus'),
    p_description
  )
  returning id into pb_id;

  insert into public.playbook_nodes (playbook_id, title, body, type)
  values (pb_id, 'Pradinis kontaktas', '', 'message')
  returning id into node_id;

  update public.playbooks
  set start_node_id = node_id
  where id = pb_id;

  return query select pb_id, node_id;
end;
$$;

grant execute on function public.create_playbook_with_start_node(text, text) to authenticated;

commit;

