begin;

-- Cold leads (rankiniai projektai): palikti tik įmones be sąskaitų istorijos.
-- Vienkartinis valymas — toliau prižiūri importas + Neksar sync prune.

-- 1) Greitas kelias: importo snapshot jau pažymėjo esamus/buvusius.
delete from public.project_manual_leads
where crm_status in ('existing_client', 'former_client');

-- 2) Likę new_lead, kurių company_code jau turi sąskaitų (index-friendly equality).
delete from public.project_manual_leads pml
where pml.company_code is not null
  and pml.company_code <> ''
  and exists (
    select 1
    from public.invoices i
    where i.company_code = pml.company_code
  );

-- Esamų CRM klientų prijungimai prie rankinių projektų cold leads logikai nepriklauso.
delete from public.project_manual_linked_clients;

commit;
