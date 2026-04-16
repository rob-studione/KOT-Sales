-- Viešųjų pirkimų projektai: sutartys, pranešimai, project_type = procurement.

begin;

alter table public.projects
  add column if not exists procurement_notify_days_before integer null;

comment on column public.projects.procurement_notify_days_before is
  'Numatytasis „pranešti prieš X dienų“ viešųjų pirkimų sutartims (importe).';

alter table public.projects
  drop constraint if exists projects_project_type_check;

alter table public.projects
  add constraint projects_project_type_check check (project_type in ('automatic', 'manual', 'procurement'));

create table if not exists public.project_procurement_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contract_uid text not null,
  contract_number text not null default '',
  contract_object text not null default '',
  organization_name text not null default '',
  organization_code text not null default '',
  supplier text not null default '',
  value numeric(18, 2) null,
  valid_until date not null,
  type text not null default '',
  assigned_to uuid null references public.crm_users (id) on delete set null,
  notify_days_before integer not null default 14,
  notified_at timestamptz null,
  status text not null default 'naujas',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_procurement_contracts_status_check check (
    status in ('naujas', 'susisiekti', 'laukiame', 'dalyvaujame', 'laimėta', 'prarasta')
  ),
  constraint project_procurement_contracts_project_contract_uid_key unique (project_id, contract_uid)
);

create index if not exists project_procurement_contracts_project_valid_until_idx
  on public.project_procurement_contracts (project_id, valid_until asc);

create index if not exists project_procurement_contracts_assigned_idx
  on public.project_procurement_contracts (assigned_to)
  where assigned_to is not null;

comment on table public.project_procurement_contracts is
  'Viešųjų pirkimų sutartys pagal projektą; rikiavimas pagal valid_until ASC.';

create or replace function public.project_procurement_contracts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_procurement_contracts_set_updated_at on public.project_procurement_contracts;
create trigger project_procurement_contracts_set_updated_at
  before update on public.project_procurement_contracts
  for each row
  execute function public.project_procurement_contracts_set_updated_at();

-- In-app pranešimai (cron įrašo per service role).
create table if not exists public.crm_user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.crm_users (id) on delete cascade,
  body text not null,
  project_id uuid null references public.projects (id) on delete set null,
  contract_id uuid null references public.project_procurement_contracts (id) on delete set null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists crm_user_notifications_user_created_idx
  on public.crm_user_notifications (user_id, created_at desc);

alter table public.project_procurement_contracts enable row level security;
alter table public.crm_user_notifications enable row level security;

drop policy if exists "project_procurement_contracts_select_authenticated" on public.project_procurement_contracts;
create policy "project_procurement_contracts_select_authenticated"
  on public.project_procurement_contracts for select to authenticated using (true);

drop policy if exists "project_procurement_contracts_insert_authenticated" on public.project_procurement_contracts;
create policy "project_procurement_contracts_insert_authenticated"
  on public.project_procurement_contracts for insert to authenticated with check (true);

drop policy if exists "project_procurement_contracts_update_authenticated" on public.project_procurement_contracts;
create policy "project_procurement_contracts_update_authenticated"
  on public.project_procurement_contracts for update to authenticated using (true) with check (true);

drop policy if exists "project_procurement_contracts_delete_authenticated" on public.project_procurement_contracts;
create policy "project_procurement_contracts_delete_authenticated"
  on public.project_procurement_contracts for delete to authenticated using (true);

grant select, insert, update, delete on public.project_procurement_contracts to authenticated;

drop policy if exists "crm_user_notifications_select_own" on public.crm_user_notifications;
create policy "crm_user_notifications_select_own"
  on public.crm_user_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "crm_user_notifications_update_own" on public.crm_user_notifications;
create policy "crm_user_notifications_update_own"
  on public.crm_user_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.crm_user_notifications to authenticated;

-- CSV importas: atnaujina laukus, statusą palieka; jei pasikeitė galiojimo data — iš naujo leidžia priminimą.
create or replace function public.merge_project_procurement_contracts_json(
  p_project_id uuid,
  p_rows jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int := 0;
  el jsonb;
  v_uid text;
  v_num text;
  v_obj text;
  v_org text;
  v_code text;
  v_sup text;
  v_val numeric;
  v_until date;
  v_type text;
  v_assign uuid;
  v_notify int;
begin
  if p_project_id is null then
    return 0;
  end if;
  for el in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_uid := nullif(trim(coalesce(el->>'contract_uid', '')), '');
    if v_uid is null then
      continue;
    end if;
    v_num := coalesce(el->>'contract_number', '');
    v_obj := coalesce(el->>'contract_object', '');
    v_org := coalesce(el->>'organization_name', '');
    v_code := coalesce(el->>'organization_code', '');
    v_sup := coalesce(el->>'supplier', '');
    v_val := null;
    if el ? 'value' and jsonb_typeof(el->'value') <> 'null' then
      v_val := (el->>'value')::numeric;
    end if;
    v_until := (el->>'valid_until')::date;
    v_type := coalesce(el->>'type', '');
    v_assign := null;
    if el ? 'assigned_to'
       and el->>'assigned_to' is not null
       and btrim(el->>'assigned_to') <> ''
       and el->>'assigned_to' ~* '^[0-9a-f-]{36}$' then
      v_assign := (el->>'assigned_to')::uuid;
    end if;
    v_notify := coalesce((el->>'notify_days_before')::int, 14);

    insert into public.project_procurement_contracts (
      project_id,
      contract_uid,
      contract_number,
      contract_object,
      organization_name,
      organization_code,
      supplier,
      value,
      valid_until,
      type,
      assigned_to,
      notify_days_before
    ) values (
      p_project_id,
      v_uid,
      v_num,
      v_obj,
      v_org,
      v_code,
      v_sup,
      v_val,
      v_until,
      v_type,
      v_assign,
      v_notify
    )
    on conflict (project_id, contract_uid) do update set
      contract_number = excluded.contract_number,
      contract_object = excluded.contract_object,
      organization_name = excluded.organization_name,
      organization_code = excluded.organization_code,
      supplier = excluded.supplier,
      value = excluded.value,
      valid_until = excluded.valid_until,
      type = excluded.type,
      assigned_to = excluded.assigned_to,
      notify_days_before = excluded.notify_days_before,
      notified_at = case
        when public.project_procurement_contracts.valid_until is distinct from excluded.valid_until
        then null
        else public.project_procurement_contracts.notified_at
      end,
      updated_at = now();

    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function public.merge_project_procurement_contracts_json(uuid, jsonb) to authenticated;
grant execute on function public.merge_project_procurement_contracts_json(uuid, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';
