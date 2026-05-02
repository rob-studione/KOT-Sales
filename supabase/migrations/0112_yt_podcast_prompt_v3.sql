begin;

-- Nauja analizės prompto versija (griežtesnė kokybė); senesnės reikšmės atnaujinamos tik jei dar nebuvo keista ranka į kitą custom reikšmę.
update public.crm_settings
set value = to_jsonb('v3_business_decision'::text)
where key = 'yt_podcast.analysis_prompt_version'
  and (
    value = to_jsonb('v1'::text)
    or value = to_jsonb('v2_deep_insight'::text)
  );

commit;
