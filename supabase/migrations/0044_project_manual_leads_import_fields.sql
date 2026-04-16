-- Manual project leads CSV import MVP fields + upsert key.

alter table public.project_manual_leads
  add column if not exists annual_revenue numeric null,
  add column if not exists annual_revenue_year integer null,
  add column if not exists crm_status text not null default 'new_lead',
  add column if not exists crm_client_id text null,
  add column if not exists last_order_at date null;

alter table public.project_manual_leads
  drop constraint if exists project_manual_leads_crm_status_check;

alter table public.project_manual_leads
  add constraint project_manual_leads_crm_status_check
  check (crm_status in ('existing_client', 'former_client', 'new_lead'));

-- Allow safe re-import/upsert by company_code within a project.
-- NULL company_code rows remain allowed and do not conflict with each other.
create unique index if not exists project_manual_leads_project_id_company_code_uniq
  on public.project_manual_leads (project_id, company_code);

create index if not exists project_manual_leads_project_id_crm_status_idx
  on public.project_manual_leads (project_id, crm_status);

notify pgrst, 'reload schema';

