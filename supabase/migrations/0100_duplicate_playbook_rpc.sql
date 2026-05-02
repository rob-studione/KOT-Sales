begin;

create or replace function public.duplicate_playbook(p_source_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  src public.playbooks%rowtype;
  new_pb_id uuid;
  old_node_id uuid;
  new_node_id uuid;
  id_map jsonb := '{}'::jsonb;
  src_start uuid;
  mapped_start uuid;
begin
  select * into src
  from public.playbooks
  where id = p_source_id;

  if not found then
    raise exception 'Playbook not found';
  end if;

  src_start := src.start_node_id;

  insert into public.playbooks (name, description, start_node_id)
  values (
    coalesce(nullif(trim(src.name), ''), 'Scenarijus') || ' kopija',
    src.description,
    null
  )
  returning id into new_pb_id;

  -- Copy nodes and build mapping old_id -> new_id
  for old_node_id in
    select n.id
    from public.playbook_nodes n
    where n.playbook_id = src.id
    order by n.created_at asc, n.id asc
  loop
    insert into public.playbook_nodes (playbook_id, title, body, type, created_at)
    select new_pb_id, n.title, n.body, n.type, n.created_at
    from public.playbook_nodes n
    where n.id = old_node_id
    returning id into new_node_id;

    id_map := id_map || jsonb_build_object(old_node_id::text, new_node_id::text);
  end loop;

  -- Copy edges using the mapping
  insert into public.playbook_edges (playbook_id, from_node_id, to_node_id, label, created_at)
  select
    new_pb_id,
    (id_map->>e.from_node_id::text)::uuid,
    (id_map->>e.to_node_id::text)::uuid,
    e.label,
    e.created_at
  from public.playbook_edges e
  where e.playbook_id = src.id
    and (id_map ? e.from_node_id::text)
    and (id_map ? e.to_node_id::text);

  -- Map start_node_id if possible
  if src_start is not null and (id_map ? src_start::text) then
    mapped_start := (id_map->>src_start::text)::uuid;
    update public.playbooks
    set start_node_id = mapped_start
    where id = new_pb_id;
  end if;

  return new_pb_id;
end;
$$;

grant execute on function public.duplicate_playbook(uuid) to authenticated;

commit;

