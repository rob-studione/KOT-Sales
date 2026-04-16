-- Vadybininkų KPI: crm_users.is_kpi_tracked (būtina prieš naudojant .eq("is_kpi_tracked", true) kode).

-- Jei anksčiau buvo bandoma kita versija su triggeriu — nuimti, kad nekirstų su backfill.
drop trigger if exists crm_users_sync_is_kpi_tracked_from_role on public.crm_users;
drop function if exists public.crm_users_sync_is_kpi_tracked_from_role();

alter table public.crm_users
  add column if not exists is_kpi_tracked boolean default true;

comment on column public.crm_users.is_kpi_tracked is
  'Jei true — naudotojas rodomas vadybininkų KPI ir jo veikla įskaitoma į komandos agregatus.';

-- Visi esami įrašai true (įskaitant atvejus, kai stulpelis anksčiau nebuvo ar buvo neteisingas).
update public.crm_users
set is_kpi_tracked = true;

alter table public.crm_users
  alter column is_kpi_tracked set default true;

alter table public.crm_users
  alter column is_kpi_tracked set not null;
