-- Commercial proposals V2: Client/Lead recipients, standalone tool permission,
-- versioned editable template content. Do not edit 0144.

begin;

-- ---------------------------------------------------------------------------
-- Recipient: Client or Lead (cold lead = project_manual_leads)
-- ---------------------------------------------------------------------------
alter table public.commercial_proposals
  add column if not exists recipient_type text,
  add column if not exists recipient_id text,
  add column if not exists recipient_name text,
  add column if not exists contact_name text,
  add column if not exists recipient_email text,
  add column if not exists recipient_phone text;

update public.commercial_proposals
set
  recipient_type = coalesce(nullif(recipient_type, ''), 'client'),
  recipient_id = coalesce(nullif(recipient_id, ''), client_id, client_key, ''),
  recipient_name = coalesce(nullif(recipient_name, ''), client_name, '')
where recipient_type is null
   or recipient_id is null
   or recipient_name is null;

alter table public.commercial_proposals
  alter column recipient_type set default 'client',
  alter column recipient_type set not null,
  alter column recipient_name set default '',
  alter column recipient_name set not null;

alter table public.commercial_proposals
  drop constraint if exists commercial_proposals_recipient_type_check;

alter table public.commercial_proposals
  add constraint commercial_proposals_recipient_type_check
  check (recipient_type in ('client', 'lead'));

alter table public.commercial_proposals
  alter column template_version set default 'LT_COMMERCIAL_V2';

create index if not exists commercial_proposals_recipient_idx
  on public.commercial_proposals (recipient_type, recipient_id, created_at desc);

create index if not exists commercial_proposals_recipient_name_idx
  on public.commercial_proposals (recipient_name);

comment on column public.commercial_proposals.recipient_type is 'client = CRM klientas; lead = project_manual_leads (šaltas lead).';
comment on column public.commercial_proposals.recipient_id is 'client_id arba project_manual_leads.id. Istorinis snapshot nerašomas iš naujo.';
comment on column public.commercial_proposals.recipient_name is 'PDF gavėjo pavadinimas; gali skirtis nuo šaltinio įrašo.';

-- ---------------------------------------------------------------------------
-- Versioned template content (LT_COMMERCIAL_V2)
-- ---------------------------------------------------------------------------
create table if not exists public.cp_template_revisions (
  id uuid primary key default gen_random_uuid(),
  template_version text not null default 'LT_COMMERCIAL_V2',
  status text not null default 'draft',
  content jsonb not null default '{}'::jsonb,
  created_by uuid null references public.crm_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint cp_template_revisions_status_check
    check (status in ('draft', 'published'))
);

create index if not exists cp_template_revisions_published_idx
  on public.cp_template_revisions (template_version, published_at desc)
  where status = 'published';

create index if not exists cp_template_revisions_draft_idx
  on public.cp_template_revisions (template_version, updated_at desc)
  where status = 'draft';

drop trigger if exists cp_template_revisions_set_updated_at on public.cp_template_revisions;
create trigger cp_template_revisions_set_updated_at
  before update on public.cp_template_revisions
  for each row
  execute function public.cp_touch_updated_at();

comment on table public.cp_template_revisions is 'Komercinio pasiūlymo šablono turinys. Sugeneruoti PDF naudoja snapshot, ne gyvą šabloną.';

-- ---------------------------------------------------------------------------
-- Permissions: tool access for sales; template/prices stay admin
-- ---------------------------------------------------------------------------
insert into public.crm_role_permissions (role_id, permission_key)
select r.id, 'nav.tools.commercial_proposals'
from public.crm_roles r
where r.key in ('admin', 'sales')
on conflict do nothing;

insert into public.crm_role_permissions (role_id, permission_key)
select distinct rp.role_id, 'nav.tools.commercial_proposals'
from public.crm_role_permissions rp
where rp.permission_key = 'nav.clients'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cp_template_revisions enable row level security;

drop policy if exists "cp_template_revisions_select_auth" on public.cp_template_revisions;
create policy "cp_template_revisions_select_auth"
  on public.cp_template_revisions for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.tools.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'settings.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'nav.clients')
  );

drop policy if exists "cp_price_items_select_auth" on public.cp_price_items;
create policy "cp_price_items_select_auth"
  on public.cp_price_items for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.tools.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'nav.clients')
  );

drop policy if exists "cp_company_history_select_auth" on public.cp_company_history;
create policy "cp_company_history_select_auth"
  on public.cp_company_history for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.tools.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'nav.clients')
    or public.crm_user_has_permission((select auth.uid()), 'settings.commercial_proposals')
  );

drop policy if exists "commercial_proposals_select_auth" on public.commercial_proposals;
create policy "commercial_proposals_select_auth"
  on public.commercial_proposals for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.tools.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'nav.clients')
  );

drop policy if exists "commercial_proposal_lines_select_auth" on public.commercial_proposal_lines;
create policy "commercial_proposal_lines_select_auth"
  on public.commercial_proposal_lines for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.tools.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'nav.clients')
  );

grant select on public.cp_template_revisions to authenticated;
grant all on public.cp_template_revisions to service_role;

notify pgrst, 'reload schema';

commit;
