begin;

insert into public.crm_settings (key, value)
values
  ('lost_qa.cost_limit_eur', 'null'::jsonb),
  ('lost_qa.stop_on_limit', 'false'::jsonb)
on conflict (key) do nothing;

commit;
