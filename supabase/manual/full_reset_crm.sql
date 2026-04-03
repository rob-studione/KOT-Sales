-- Run manually in Supabase SQL Editor BEFORE a full Saskaita123 sync (after truncating, use „Pilna sinchronizacija“ in the app).
-- Removes all CRM invoice rows and per-client aggregates so the next sync repopulates from scratch.
-- Apply migration 0005_canonical_lt_crm.sql first so column names are company_code / company_name.

truncate table public.invoices restart identity;
truncate table public.companies restart identity;
