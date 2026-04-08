-- Extend crm_users to support editable profile fields and account status.
-- New columns:
-- - first_name, last_name (for drawer form)
-- - phone (nullable)
-- - status: active|inactive (default active)

begin;

alter table public.crm_users
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists phone text null,
  add column if not exists status text not null default 'active';

alter table public.crm_users
  drop constraint if exists crm_users_status_check;

alter table public.crm_users
  add constraint crm_users_status_check check (status in ('active', 'inactive'));

-- Backfill first_name/last_name from existing name where missing.
-- Rule:
-- - if name has >=2 words => first_name = first, last_name = rest
-- - else => first_name = name, last_name = ''
update public.crm_users
set
  first_name = case
    when btrim(coalesce(first_name, '')) <> '' then first_name
    when btrim(coalesce(name, '')) = '' then ''
    when array_length(regexp_split_to_array(btrim(name), '\\s+'), 1) >= 2
      then (regexp_split_to_array(btrim(name), '\\s+'))[1]
    else btrim(name)
  end,
  last_name = case
    when btrim(coalesce(last_name, '')) <> '' then last_name
    when btrim(coalesce(name, '')) = '' then ''
    when array_length(regexp_split_to_array(btrim(name), '\\s+'), 1) >= 2
      then array_to_string((regexp_split_to_array(btrim(name), '\\s+'))[2:array_length(regexp_split_to_array(btrim(name), '\\s+'), 1)], ' ')
    else ''
  end
where (btrim(coalesce(first_name, '')) = '' or btrim(coalesce(last_name, '')) = '');

commit;

