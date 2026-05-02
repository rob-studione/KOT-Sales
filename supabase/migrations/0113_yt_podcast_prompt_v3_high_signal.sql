begin;

-- High-signal analizės pipeline (griežtesni barjerai + naujas meta.schema_version).
update public.crm_settings
set value = to_jsonb('v3_high_signal'::text)
where key = 'yt_podcast.analysis_prompt_version'
  and value = to_jsonb('v3_business_decision'::text);

commit;
