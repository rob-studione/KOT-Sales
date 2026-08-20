-- Per-category discounts for commercial proposals.
-- Source of truth for drafts. Historical snapshots are not rewritten.

begin;

create table if not exists public.commercial_proposal_discounts (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.commercial_proposals (id) on delete cascade,
  category text not null,
  percentage numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint commercial_proposal_discounts_category_check
    check (category in ('translation', 'ai_translation', 'additional_service')),
  constraint commercial_proposal_discounts_pct_check
    check (percentage >= 0 and percentage <= 100),
  constraint commercial_proposal_discounts_proposal_category_key
    unique (proposal_id, category)
);

create index if not exists commercial_proposal_discounts_proposal_idx
  on public.commercial_proposal_discounts (proposal_id);

comment on table public.commercial_proposal_discounts is
  'Komercinio pasiūlymo nuolaidos pagal kainyno kategoriją (translation / ai_translation / additional_service).';

insert into public.commercial_proposal_discounts (proposal_id, category, percentage)
select p.id, c.category, p.global_discount_pct
from public.commercial_proposals p
cross join (
  values
    ('translation'),
    ('ai_translation'),
    ('additional_service')
) as c(category)
on conflict (proposal_id, category) do nothing;

alter table public.commercial_proposal_discounts enable row level security;

drop policy if exists "commercial_proposal_discounts_select_auth" on public.commercial_proposal_discounts;
create policy "commercial_proposal_discounts_select_auth"
  on public.commercial_proposal_discounts for select to authenticated
  using (
    public.crm_user_has_permission((select auth.uid()), 'nav.tools.commercial_proposals')
    or public.crm_user_has_permission((select auth.uid()), 'nav.clients')
  );

grant select on public.commercial_proposal_discounts to authenticated;
grant all on public.commercial_proposal_discounts to service_role;

notify pgrst, 'reload schema';

commit;
