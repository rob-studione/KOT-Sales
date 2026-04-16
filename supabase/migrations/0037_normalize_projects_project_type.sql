-- Seni įrašai: project_type NULL, tuščias arba neteisinga reikšmė → automatic (istorinis modelis).
-- „manual“ palaikome case-insensitive, rezultatas visada mažosiomis (check constraint).

update public.projects
set project_type = case
  when lower(trim(coalesce(project_type, ''))) = 'manual' then 'manual'
  else 'automatic'
end;

notify pgrst, 'reload schema';
