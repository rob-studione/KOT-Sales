-- Importo deduplikacija pagal import_dedupe_key (ne tik contract_uid iš CSV).

begin;

alter table public.project_procurement_contracts
  add column if not exists import_dedupe_key text null;

update public.project_procurement_contracts
set import_dedupe_key = 'legacy:' || contract_uid
where import_dedupe_key is null or btrim(import_dedupe_key) = '';

alter table public.project_procurement_contracts
  alter column import_dedupe_key set not null;

alter table public.project_procurement_contracts
  drop constraint if exists project_procurement_contracts_project_contract_uid_key;

alter table public.project_procurement_contracts
  drop constraint if exists project_procurement_contracts_project_id_import_dedupe_key_key;

alter table public.project_procurement_contracts
  add constraint project_procurement_contracts_project_id_import_dedupe_key_key
  unique (project_id, import_dedupe_key);

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
  v_dedupe text;
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
    v_dedupe := nullif(trim(coalesce(el->>'import_dedupe_key', '')), '');
    if v_dedupe is null then
      continue;
    end if;
    v_uid := trim(coalesce(el->>'contract_uid', ''));
    v_num := trim(coalesce(el->>'contract_number', ''));
    v_obj := trim(coalesce(el->>'contract_object', ''));
    v_org := trim(coalesce(el->>'organization_name', ''));
    v_code := trim(coalesce(el->>'organization_code', ''));
    v_sup := trim(coalesce(el->>'supplier', ''));
    v_val := null;
    if el ? 'value' and jsonb_typeof(el->'value') <> 'null' then
      v_val := (el->>'value')::numeric;
    end if;
    v_until := (el->>'valid_until')::date;
    v_type := trim(coalesce(el->>'type', ''));
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
      import_dedupe_key,
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
      v_dedupe,
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
    on conflict (project_id, import_dedupe_key) do update set
      contract_uid = excluded.contract_uid,
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
