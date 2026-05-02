-- Podcast v3 end-to-end audit (read-only). Run: set -a && . ./.env.local && set +a && node scripts/run-sql.cjs scripts/podcast-v3-audit.sql

select 'crm_settings yt_podcast.analysis_prompt_version' as check_id, key, value::text
from public.crm_settings
where key = 'yt_podcast.analysis_prompt_version';

select 'insights v3 schema count' as check_id,
  count(*) filter (where detail->'meta'->>'schema_version' = 'v3_high_signal') as v3_high_signal,
  count(*) filter (where detail->'meta'->>'schema_version' = 'v3_business_decision') as v3_business_decision,
  count(*) as total
from public.yt_video_insights;

select 'insights with insight_type' as check_id,
  count(*) filter (where detail ? 'insight_type' and coalesce(trim(detail->>'insight_type'), '') <> '') as with_type,
  count(*) as total
from public.yt_video_insights;

select 'sample recent insights' as check_id, id,
  left(headline, 80) as headline_preview,
  detail->>'recommended' as rec,
  detail->>'interesting_score' as i,
  detail->>'business_relevance_score' as br,
  detail->'meta'->>'schema_version' as schema_v,
  detail->>'insight_type' as insight_type,
  jsonb_array_length(coalesce(detail->'key_facts', '[]'::jsonb)) as key_facts_n,
  length(trim(replace(coalesce(detail->>'action', ''), '👉', ''))) as action_body_len
from public.yt_video_insights
order by created_at desc
limit 8;
