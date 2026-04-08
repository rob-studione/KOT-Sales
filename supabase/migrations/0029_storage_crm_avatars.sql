-- Storage bucket for CRM user avatars.
-- Read is public (bucket public + explicit SELECT policy), writes happen only via server (service-role).

begin;

-- Create bucket if missing.
insert into storage.buckets (id, name, public)
values ('crm-avatars', 'crm-avatars', true)
on conflict (id) do update set public = true;

-- Ensure RLS is enabled on storage.objects.
alter table storage.objects enable row level security;

-- Allow public read access for avatar objects.
drop policy if exists "crm_avatars_public_read" on storage.objects;
create policy "crm_avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'crm-avatars');

commit;

