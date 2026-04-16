-- Jei 0032 buvo pritaikyta rankiniu būdu be NOTIFY, ši migracija perkrauna PostgREST schemą.
-- Saugu paleisti pakartotinai.

notify pgrst, 'reload schema';
