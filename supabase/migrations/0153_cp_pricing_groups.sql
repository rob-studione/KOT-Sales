-- Named discount presets for commercial proposals (Kainodaros grupės).
-- Catalog prices stay global; groups only fill default category percentages.

begin;

create table if not exists public.cp_pricing_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  is_default boolean not null default false,
  translation_pct numeric(5,2) not null default 0,
  ai_translation_pct numeric(5,2) not null default 0,
  additional_service_pct numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cp_pricing_groups_name_check check (char_length(btrim(name)) > 0),
  constraint cp_pricing_groups_pct_check check (
    translation_pct >= 0 and translation_pct <= 100
    and ai_translation_pct >= 0 and ai_translation_pct <= 100
    and additional_service_pct >= 0 and additional_service_pct <= 100
  )
);

create unique index if not exists cp_pricing_groups_one_default_idx
  on public.cp_pricing_groups ((true))
  where is_default = true;

create index if not exists cp_pricing_groups_active_sort_idx
  on public.cp_pricing_groups (active, sort_order, name);

comment on table public.cp_pricing_groups is
  'Kainodaros grupės: numatytos kategorijų nuolaidos. Kuriant pasiūlymą pasirenkama ranka.';

drop trigger if exists cp_pricing_groups_set_updated_at on public.cp_pricing_groups;
create trigger cp_pricing_groups_set_updated_at
  before update on public.cp_pricing_groups
  for each row
  execute function public.cp_touch_updated_at();

insert into public.cp_pricing_groups (name, sort_order, active, is_default, translation_pct, ai_translation_pct, additional_service_pct)
select 'Privačios įmonės', 0, true, true, 0, 0, 0
where not exists (select 1 from public.cp_pricing_groups);

insert into public.cp_pricing_groups (name, sort_order, active, is_default, translation_pct, ai_translation_pct, additional_service_pct)
select 'Įstaigos', 1, true, false, 0, 0, 0
where (select count(*) from public.cp_pricing_groups) = 1;

alter table public.cp_pricing_groups enable row level security;

drop policy if exists "cp_pricing_groups_select_auth" on public.cp_pricing_groups;
create policy "cp_pricing_groups_select_auth"
  on public.cp_pricing_groups for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.tools.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'nav.clients')
    or public.crm_user_has_permission((select auth.uid()), 'settings.commercial_proposals')
  );

grant select on public.cp_pricing_groups to authenticated;
grant all on public.cp_pricing_groups to service_role;

notify pgrst, 'reload schema';

commit;
