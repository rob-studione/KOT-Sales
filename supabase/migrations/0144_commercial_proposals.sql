-- Commercial proposals (KOT Sales): catalog, company history, drafts/snapshots, numbering.

begin;

-- ---------------------------------------------------------------------------
-- Profile: job title for proposal intro page
-- ---------------------------------------------------------------------------
alter table public.crm_users
  add column if not exists job_title text not null default 'Pardavimų vadybininkas';

comment on column public.crm_users.job_title is 'Pareigos komerciniame pasiūlyme (įžangos puslapis).';

-- ---------------------------------------------------------------------------
-- Catalog: translation / AI / additional service prices (not hardcoded in PDF)
-- ---------------------------------------------------------------------------
create table if not exists public.cp_price_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  sort_order integer not null,
  label text not null,
  base_price numeric(12,2) null,
  currency text not null default 'EUR',
  unit text null,
  is_from_price boolean not null default false,
  is_free boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cp_price_items_category_check
    check (category in ('translation', 'ai_translation', 'additional_service')),
  constraint cp_price_items_free_or_price_check
    check (is_free = true or base_price is not null)
);

create unique index if not exists cp_price_items_category_sort_uidx
  on public.cp_price_items (category, sort_order);

create index if not exists cp_price_items_active_category_idx
  on public.cp_price_items (category, sort_order)
  where active = true;

comment on table public.cp_price_items is 'Komercinio pasiūlymo kainynas (vertimas, AI, papildomos paslaugos).';

drop trigger if exists cp_price_items_set_updated_at on public.cp_price_items;
create or replace function public.cp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cp_price_items_set_updated_at
  before update on public.cp_price_items
  for each row
  execute function public.cp_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Company history (Mūsų istorija)
-- ---------------------------------------------------------------------------
create table if not exists public.cp_company_history (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  body text not null,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cp_company_history_year_uidx
  on public.cp_company_history (year);

create index if not exists cp_company_history_active_sort_idx
  on public.cp_company_history (sort_order, year)
  where active = true;

comment on table public.cp_company_history is 'Komercinio pasiūlymo skiltis „Mūsų istorija“ (metai + tekstas).';

drop trigger if exists cp_company_history_set_updated_at on public.cp_company_history;
create trigger cp_company_history_set_updated_at
  before update on public.cp_company_history
  for each row
  execute function public.cp_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Proposals + lines + numbering
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_proposal_counters (
  year integer primary key,
  last_number integer not null default 0
);

comment on table public.commercial_proposal_counters is 'CP-YYYY-NNNN skaitiklis; incrementas per next_commercial_proposal_number().';

create table if not exists public.commercial_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_number text unique,
  status text not null default 'draft',
  template_version text not null default 'LT_COMMERCIAL_V1',
  client_key text not null default '',
  client_id text null,
  company_code text null,
  client_name text not null default '',
  sales_manager_id uuid null references public.crm_users (id) on delete set null,
  global_discount_pct numeric(6,2) not null default 0,
  created_by uuid null references public.crm_users (id) on delete set null,
  generated_at timestamptz null,
  pdf_storage_path text null,
  snapshot jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_proposals_status_check
    check (status in ('draft', 'generated', 'sent', 'accepted', 'rejected', 'expired')),
  constraint commercial_proposals_discount_check
    check (global_discount_pct >= 0 and global_discount_pct <= 100)
);

create index if not exists commercial_proposals_client_id_idx
  on public.commercial_proposals (client_id, created_at desc);

create index if not exists commercial_proposals_company_code_idx
  on public.commercial_proposals (company_code, created_at desc);

create index if not exists commercial_proposals_status_idx
  on public.commercial_proposals (status, created_at desc);

create index if not exists commercial_proposals_created_by_idx
  on public.commercial_proposals (created_by, created_at desc);

comment on table public.commercial_proposals is 'Komerciniai pasiūlymai: juodraščiai ir istoriniai snapshot''ai.';

drop trigger if exists commercial_proposals_set_updated_at on public.commercial_proposals;
create trigger commercial_proposals_set_updated_at
  before update on public.commercial_proposals
  for each row
  execute function public.cp_touch_updated_at();

create table if not exists public.commercial_proposal_lines (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.commercial_proposals (id) on delete cascade,
  category text not null,
  catalog_item_id uuid null references public.cp_price_items (id) on delete set null,
  sort_order integer not null,
  label text not null,
  base_price numeric(12,2) null,
  calculated_price numeric(12,2) null,
  final_price numeric(12,2) null,
  is_manual_override boolean not null default false,
  is_from_price boolean not null default false,
  is_free boolean not null default false,
  currency text not null default 'EUR',
  unit text null,
  created_at timestamptz not null default now(),
  constraint commercial_proposal_lines_category_check
    check (category in ('translation', 'ai_translation', 'additional_service'))
);

create index if not exists commercial_proposal_lines_proposal_idx
  on public.commercial_proposal_lines (proposal_id, category, sort_order);

comment on table public.commercial_proposal_lines is 'Pasiūlymo eilutės (bazinė / skaičiuota / galutinė kaina ir rankinis override).';

create or replace function public.next_commercial_proposal_number()
returns text
language plpgsql
as $$
declare
  y int;
  n int;
begin
  y := extract(year from timezone('Europe/Vilnius', now()))::int;
  insert into public.commercial_proposal_counters as c (year, last_number)
  values (y, 1)
  on conflict (year) do update
    set last_number = c.last_number + 1
  returning last_number into n;
  return 'CP-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function public.next_commercial_proposal_number() from public;
grant execute on function public.next_commercial_proposal_number() to service_role;

-- ---------------------------------------------------------------------------
-- Seed: company history (reference PDF through 2024)
-- ---------------------------------------------------------------------------
insert into public.cp_company_history (year, body, sort_order, active)
values
  (2016, 'įsikūrėme Lietuvoje siekdami teikti aukštos kokybės vertimo paslaugas per trumpiausią laiką', 10, true),
  (2017, 'įgijome vienos didžiausių įmonių Lietuvoje pasitikėjimą', 20, true),
  (2018, 'tapome vienu pagrindinių vertimo paslaugų tiekėjų viešajam sektoriui ir įžengėme į Jungtinės Karalystės rinką', 30, true),
  (2019, 'tapome ITI asociacijos nariais Jungtinėje Karalystėje', 40, true),
  (2020, 'sukūrėme unikalią „KoT Cloud“ vertimo paslaugų valdymo sistemą', 50, true),
  (2021, 'sukūrėme „KoT Editor“ CAT vertimo įrankį savo vertėjams', 60, true),
  (2022, 'sėkmingai įžengėme į JAV rinką ir tapome ATA (American Translators Association) nariais', 70, true),
  (2023, 'JAV rinkoje tapome didžiausio vertimų biuro pasaulyje „RWS Group“, kuriam padedame aptarnauti klientą „Apple“ lokalizuodami jų tekstus, vertimo paslaugų tiekėjais', 80, true),
  (2024, 'JAV buvome atrinkti į „GSA SCHEDULE“ vertimo paslaugų tiekimo sistemą, kurios pagalba galime teikti vertimo paslaugas visoms federalinėms JAV įstaigoms', 90, true)
on conflict (year) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: written translation prices
-- ---------------------------------------------------------------------------
insert into public.cp_price_items (category, sort_order, label, base_price, is_from_price, is_free, unit)
values
  ('translation', 1, 'Lietuvių ↔ Anglų', 10.80, false, false, null),
  ('translation', 2, 'Lietuvių ↔ Rusų', 10.80, false, false, null),
  ('translation', 3, 'Lietuvių ↔ Vokiečių', 13.50, false, false, null),
  ('translation', 4, 'Lietuvių ↔ Lenkų', 13.50, false, false, null),
  ('translation', 5, 'Lietuvių ↔ Latvių', 15.30, false, false, null),
  ('translation', 6, 'Lietuvių ↔ Estų', 21.60, false, false, null),
  ('translation', 7, 'Lietuvių ↔ Italų', 16.20, false, false, null),
  ('translation', 8, 'Lietuvių ↔ Prancūzų', 16.20, false, false, null),
  ('translation', 9, 'Lietuvių ↔ Ispanų', 16.20, false, false, null),
  ('translation', 10, 'Lietuvių ↔ Baltarusių', 16.20, false, false, null),
  ('translation', 11, 'Lietuvių ↔ Ukrainiečių', 16.20, false, false, null),
  ('translation', 12, 'Lietuvių ↔ Olandų', 16.20, false, false, null),
  ('translation', 13, 'Lietuvių ↔ Norvegų', 17.10, false, false, null),
  ('translation', 14, 'Lietuvių ↔ Švedų', 17.10, false, false, null),
  ('translation', 15, 'Lietuvių ↔ Danų', 16.00, false, false, null),
  ('translation', 16, 'Lietuvių ↔ Graikų', 19.80, false, false, null),
  ('translation', 17, 'Lietuvių ↔ Portugalų', 19.80, false, false, null),
  ('translation', 18, 'Lietuvių ↔ Albanų', 19.80, false, false, null),
  ('translation', 19, 'Lietuvių ↔ Bulgarų', 19.80, false, false, null),
  ('translation', 20, 'Lietuvių ↔ Kroatų', 19.80, false, false, null),
  ('translation', 21, 'Lietuvių ↔ Čekų', 19.80, false, false, null),
  ('translation', 22, 'Lietuvių ↔ Suomių', 19.80, false, false, null),
  ('translation', 23, 'Lietuvių ↔ Gruzinų', 19.80, false, false, null),
  ('translation', 24, 'Lietuvių ↔ Vengrų', 19.80, false, false, null),
  ('translation', 25, 'Lietuvių ↔ Kazachų', 19.80, false, false, null),
  ('translation', 26, 'Lietuvių ↔ Rumunų', 19.80, false, false, null),
  ('translation', 27, 'Lietuvių ↔ Serbų', 19.80, false, false, null),
  ('translation', 28, 'Lietuvių ↔ Turkų', 19.80, false, false, null),
  ('translation', 29, 'Lietuvių ↔ Arabų', 21.60, false, false, null),
  ('translation', 30, 'Lietuvių ↔ Japonų', 21.60, false, false, null),
  ('translation', 31, 'Lietuvių ↔ Kinų', 21.60, false, false, null),
  ('translation', 32, 'Lietuvių ↔ Islandų', 27.00, false, false, null),
  ('translation', 33, 'Lietuvių ↔ Hebrajų', 21.60, false, false, null),
  ('translation', 34, 'Kitos kalbų kombinacijos', 22.50, true, false, null)
on conflict (category, sort_order) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: AI translation prices (stored independently; not derived in generator)
-- ---------------------------------------------------------------------------
insert into public.cp_price_items (category, sort_order, label, base_price, is_from_price, is_free, unit)
values
  ('ai_translation', 1, 'Lietuvių ↔ Anglų', 6.48, false, false, null),
  ('ai_translation', 2, 'Lietuvių ↔ Rusų', 6.48, false, false, null),
  ('ai_translation', 3, 'Lietuvių ↔ Vokiečių', 8.10, false, false, null),
  ('ai_translation', 4, 'Lietuvių ↔ Lenkų', 8.10, false, false, null),
  ('ai_translation', 5, 'Lietuvių ↔ Latvių', 9.18, false, false, null),
  ('ai_translation', 6, 'Lietuvių ↔ Estų', 12.96, false, false, null),
  ('ai_translation', 7, 'Lietuvių ↔ Italų', 9.72, false, false, null),
  ('ai_translation', 8, 'Lietuvių ↔ Prancūzų', 9.72, false, false, null),
  ('ai_translation', 9, 'Lietuvių ↔ Ispanų', 9.72, false, false, null),
  ('ai_translation', 10, 'Lietuvių ↔ Baltarusių', 9.72, false, false, null),
  ('ai_translation', 11, 'Lietuvių ↔ Ukrainiečių', 9.72, false, false, null),
  ('ai_translation', 12, 'Lietuvių ↔ Olandų', 9.72, false, false, null),
  ('ai_translation', 13, 'Lietuvių ↔ Norvegų', 10.26, false, false, null),
  ('ai_translation', 14, 'Lietuvių ↔ Švedų', 10.26, false, false, null),
  ('ai_translation', 15, 'Lietuvių ↔ Danų', 9.60, false, false, null),
  ('ai_translation', 16, 'Lietuvių ↔ Graikų', 11.88, false, false, null),
  ('ai_translation', 17, 'Lietuvių ↔ Portugalų', 11.88, false, false, null),
  ('ai_translation', 18, 'Lietuvių ↔ Albanų', 11.88, false, false, null),
  ('ai_translation', 19, 'Lietuvių ↔ Bulgarų', 11.88, false, false, null),
  ('ai_translation', 20, 'Lietuvių ↔ Kroatų', 11.88, false, false, null),
  ('ai_translation', 21, 'Lietuvių ↔ Čekų', 11.88, false, false, null),
  ('ai_translation', 22, 'Lietuvių ↔ Suomių', 11.88, false, false, null),
  ('ai_translation', 23, 'Lietuvių ↔ Gruzinų', 11.88, false, false, null),
  ('ai_translation', 24, 'Lietuvių ↔ Vengrų', 11.88, false, false, null),
  ('ai_translation', 25, 'Lietuvių ↔ Kazachų', 11.88, false, false, null),
  ('ai_translation', 26, 'Lietuvių ↔ Rumunų', 11.88, false, false, null),
  ('ai_translation', 27, 'Lietuvių ↔ Serbų', 11.88, false, false, null),
  ('ai_translation', 28, 'Lietuvių ↔ Turkų', 11.88, false, false, null),
  ('ai_translation', 29, 'Lietuvių ↔ Arabų', 12.96, false, false, null),
  ('ai_translation', 30, 'Lietuvių ↔ Japonų', 12.96, false, false, null),
  ('ai_translation', 31, 'Lietuvių ↔ Kinų', 12.96, false, false, null),
  ('ai_translation', 32, 'Lietuvių ↔ Islandų', 16.20, false, false, null),
  ('ai_translation', 33, 'Lietuvių ↔ Hebrajų', 12.96, false, false, null),
  ('ai_translation', 34, 'Kitos kalbų kombinacijos', 13.50, true, false, null)
on conflict (category, sort_order) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: additional services
-- ---------------------------------------------------------------------------
insert into public.cp_price_items (category, sort_order, label, base_price, is_from_price, is_free, unit)
values
  ('additional_service', 1, 'Standartinis maketavimas', null, false, true, null),
  ('additional_service', 2, 'Profesionalus maketavimas', 3.00, true, false, 'psl.*'),
  ('additional_service', 3, 'Vertimų biuro patvirtinimas', null, false, true, null),
  ('additional_service', 4, 'Notarinis patvirtinimas', 16.53, false, false, 'dokumentas'),
  ('additional_service', 5, 'Apostilė (tvirtinimas pažyma Apostille)', 24.79, false, false, 'dokumentas'),
  ('additional_service', 6, 'Dokumentų siuntimas registruotu laišku', 4.92, false, false, 'vnt.'),
  ('additional_service', 7, 'Dokumentų pristatymas kurjeriu Lietuvoje', 7.40, false, false, 'vnt.'),
  ('additional_service', 8, 'Dokumentų pristatymas kurjeriu užsienyje', 24.00, true, false, 'vnt.'),
  ('additional_service', 9, 'Redagavimas', 2.60, true, false, 'psl.*'),
  ('additional_service', 10, 'Stilistinis / kūrybinis redagavimas', 6.00, true, false, 'psl.*'),
  ('additional_service', 11, 'Įgarsinimas', 25.00, true, false, '100 ž.'),
  ('additional_service', 12, 'Transkribavimas', 3.00, true, false, 'min.'),
  ('additional_service', 13, 'Subtitravimas', 12.00, true, false, '100 ž.'),
  ('additional_service', 14, 'Nuoseklusis vertimas žodžiu (1 vertėjas)', 65.00, true, false, 'val.'),
  ('additional_service', 15, 'Sinchroninis vertimas žodžiu (2 vertėjai)', 160.00, true, false, 'val.')
on conflict (category, sort_order) do nothing;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.crm_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.crm_roles r
cross join (
  values
    ('settings.commercial_proposals')
) as p(permission_key)
where r.key = 'admin'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cp_price_items enable row level security;
alter table public.cp_company_history enable row level security;
alter table public.commercial_proposal_counters enable row level security;
alter table public.commercial_proposals enable row level security;
alter table public.commercial_proposal_lines enable row level security;

drop policy if exists "cp_price_items_select_auth" on public.cp_price_items;
create policy "cp_price_items_select_auth"
  on public.cp_price_items for select to authenticated
  using (public.crm_user_has_permission((select auth.uid()), 'nav.clients'));

drop policy if exists "cp_company_history_select_auth" on public.cp_company_history;
create policy "cp_company_history_select_auth"
  on public.cp_company_history for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.clients')
    or public.crm_user_has_permission((select auth.uid()), 'settings.commercial_proposals')
  );

drop policy if exists "commercial_proposals_select_auth" on public.commercial_proposals;
create policy "commercial_proposals_select_auth"
  on public.commercial_proposals for select to authenticated
  using (public.crm_user_has_permission((select auth.uid()), 'nav.clients'));

drop policy if exists "commercial_proposal_lines_select_auth" on public.commercial_proposal_lines;
create policy "commercial_proposal_lines_select_auth"
  on public.commercial_proposal_lines for select to authenticated
  using (public.crm_user_has_permission((select auth.uid()), 'nav.clients'));

grant select on public.cp_price_items to authenticated;
grant select on public.cp_company_history to authenticated;
grant select on public.commercial_proposals to authenticated;
grant select on public.commercial_proposal_lines to authenticated;

grant all on public.cp_price_items to service_role;
grant all on public.cp_company_history to service_role;
grant all on public.commercial_proposal_counters to service_role;
grant all on public.commercial_proposals to service_role;
grant all on public.commercial_proposal_lines to service_role;

notify pgrst, 'reload schema';

commit;
