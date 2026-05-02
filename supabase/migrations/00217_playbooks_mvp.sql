begin;

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.playbook_nodes (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'message',
  created_at timestamptz not null default now()
);

create table if not exists public.playbook_edges (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  from_node_id uuid not null references public.playbook_nodes (id) on delete cascade,
  to_node_id uuid not null references public.playbook_nodes (id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  constraint playbook_edges_same_playbook check (playbook_id is not null)
);

create index if not exists playbook_nodes_playbook_id_idx on public.playbook_nodes (playbook_id);
create index if not exists playbook_edges_playbook_id_idx on public.playbook_edges (playbook_id);
create index if not exists playbook_edges_from_node_id_idx on public.playbook_edges (from_node_id);

alter table public.playbooks enable row level security;
alter table public.playbook_nodes enable row level security;
alter table public.playbook_edges enable row level security;

drop policy if exists "playbooks_authenticated_select" on public.playbooks;
create policy "playbooks_authenticated_select"
  on public.playbooks for select to authenticated
  using (true);

drop policy if exists "playbook_nodes_authenticated_select" on public.playbook_nodes;
create policy "playbook_nodes_authenticated_select"
  on public.playbook_nodes for select to authenticated
  using (true);

drop policy if exists "playbook_edges_authenticated_select" on public.playbook_edges;
create policy "playbook_edges_authenticated_select"
  on public.playbook_edges for select to authenticated
  using (true);

grant select on public.playbooks to authenticated;
grant select on public.playbook_nodes to authenticated;
grant select on public.playbook_edges to authenticated;

-- Demo scenarijus: "Prarasto kliento reaktivacija"
with pb as (
  insert into public.playbooks (name, description)
  values ('Prarasto kliento reaktivacija', 'Trumpas skambučio scenarijus prarastam klientui reaktivuoti.')
  returning id
),
nodes as (
  insert into public.playbook_nodes (playbook_id, title, body, type)
  select
    pb.id,
    v.title,
    v.body,
    v.type
  from pb
  join (
    values
      ('Pradinis kontaktas', 'Sveiki, skambinu iš Vertimų Karalių...', 'message'),
      ('Turi poreikį', 'Puiku. Ar galėtumėte trumpai papasakoti, kokio vertimo reikia ir iki kada?', 'message'),
      ('Vėliau', 'Supratau. Kada būtų patogiausia grįžti su skambučiu – rytoj ar kitą savaitę?', 'message'),
      ('Neaktualu', 'Ačiū už atsakymą. Jei situacija pasikeis, visada galite kreiptis.', 'end')
  ) as v(title, body, type) on true
  returning id, playbook_id, title
),
root as (
  select id as node_id, playbook_id from nodes where title = 'Pradinis kontaktas' limit 1
),
targets as (
  select
    n.playbook_id,
    n.id as node_id,
    n.title
  from nodes n
  where n.title in ('Turi poreikį', 'Vėliau', 'Neaktualu')
)
insert into public.playbook_edges (playbook_id, from_node_id, to_node_id, label)
select
  r.playbook_id,
  r.node_id,
  t.node_id,
  t.title
from root r
join targets t on t.playbook_id = r.playbook_id;

commit;

