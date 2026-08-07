-- Saugus backfill: kai company_code tuščias, o vat_code yra tikras business ID
-- (ne PERSON_*), užpildome company_code iš vat_code.
-- Tai sumažina klaidingus client_key dublikatus (pvz. TROIA d.o.o.),
-- nejungiant pagal pavadinimą.

update public.invoices i
set company_code = trim(i.vat_code)
where nullif(trim(i.company_code), '') is null
  and nullif(trim(i.vat_code), '') is not null
  and trim(i.vat_code) not ilike 'PERSON_%';
