create table if not exists public.provider_conversion_evidence (
  id bigserial primary key,
  provider text not null,
  provider_evidence_id text not null,
  custom_id text,
  occurred_at timestamptz,
  observed_at timestamptz not null default now(),
  confirmed_revenue_usd numeric(14,2) not null check (confirmed_revenue_usd >= 0),
  status text not null default 'provider_confirmed'
    check (status in ('provider_confirmed','reconciled','rejected')),
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, provider_evidence_id)
);

alter table public.provider_conversion_evidence enable row level security;
revoke all on table public.provider_conversion_evidence from anon, authenticated;
grant all on table public.provider_conversion_evidence to service_role;

comment on table public.provider_conversion_evidence is
'Server-only immutable provider-confirmed conversion evidence. Raw partner CSV files are not stored here.';

create index if not exists provider_conversion_evidence_observed_at_idx
  on public.provider_conversion_evidence (observed_at desc);

create or replace function public.owner_telemetry_snapshot(
  p_now timestamptz default now(),
  p_lookback_days integer default 30,
  p_recent_limit integer default 40
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
with bounds as (
  select p_now - make_interval(days => greatest(1, least(p_lookback_days, 90))) as start_at,
         p_now - interval '24 hours' as day_at
),
clicks as (
  select a.* from public.affiliate_clicks a, bounds
  where a.clicked_at >= bounds.start_at and a.clicked_at <= p_now
),
recent as (
  select coalesce(jsonb_agg(to_jsonb(r) order by r."clickedAt" desc), '[]'::jsonb) as items
  from (
    select id, clicked_at as "clickedAt", provider, custom_id as "customId",
      campaign_id as "campaignId", campaign_source as "campaignSource", source,
      vertical, item_slug as "itemSlug", series_slug as "seriesSlug",
      series_name as "seriesName", brand, figure, kind, placement,
      source_path as "sourcePath", destination, pii_stored as "piiStored"
    from clicks
    order by clicked_at desc
    limit greatest(1, least(p_recent_limit, 100))
  ) r
),
by_vertical as (
  select coalesce(jsonb_object_agg(coalesce(vertical, 'unknown'), n), '{}'::jsonb) as data
  from (select vertical, count(*)::int as n from clicks group by vertical) v
),
by_provider as (
  select coalesce(jsonb_object_agg(provider, n), '{}'::jsonb) as data
  from (select provider, count(*)::int as n from clicks group by provider) p
),
analytics_rows as (
  select ae.* from public.analytics_events ae, bounds
  where ae.captured_at >= bounds.start_at and ae.captured_at <= p_now
    and coalesce(ae.namespace, 'production') = 'production'
),
analytics as (
  select count(*)::int as total,
         count(*) filter (where captured_at >= (select day_at from bounds))::int as last24h,
         count(*) filter (where event_name = 'page_view')::int as page_views,
         count(*) filter (where event_name = 'landing_session_source')::int as landing_sources,
         count(*) filter (
           where event_name = 'waitlist_signup'
             and lower(coalesce(metadata->>'providerConfirmed','false')) = 'true'
         )::int as confirmed_signups
  from analytics_rows
),
source_breakdown as (
  select coalesce(jsonb_object_agg(source_key, n), '{}'::jsonb) as data
  from (
    select coalesce(nullif(source,''), 'direct') as source_key, count(*)::int as n
    from analytics_rows
    where event_name = 'landing_session_source'
    group by 1
  ) s
),
campaign_breakdown as (
  select coalesce(jsonb_object_agg(campaign_key, n), '{}'::jsonb) as data
  from (
    select campaign as campaign_key, count(*)::int as n
    from analytics_rows
    where event_name = 'landing_session_source' and campaign is not null and campaign <> ''
    group by 1
  ) c
),
questions as (
  select count(*)::int as total
  from public.mr_know_it_all_questions q, bounds
  where q.created_at >= bounds.start_at and q.created_at <= p_now
),
conversions as (
  select e.*
  from public.provider_conversion_evidence e, bounds
  where coalesce(e.occurred_at, e.observed_at) >= bounds.start_at
    and coalesce(e.occurred_at, e.observed_at) <= p_now
    and e.status in ('provider_confirmed','reconciled')
),
funnel as (
  select jsonb_build_object(
    'pageViews', (select page_views from analytics),
    'landingSources', (select landing_sources from analytics),
    'questions', (select total from questions),
    'confirmedSignups', (select confirmed_signups from analytics),
    'outboundClicks', (select count(*)::int from clicks),
    'providerConfirmedConversions', (select count(*)::int from conversions),
    'confirmedRevenueUSD', coalesce((select round(sum(confirmed_revenue_usd)::numeric, 2) from conversions), 0),
    'zeroState', case when (select count(*) from conversions) = 0 then 'No verified conversions yet' else null end,
    'breakdowns', jsonb_build_object(
      'sources', (select data from source_breakdown),
      'campaigns', (select data from campaign_breakdown)
    )
  ) as data
)
select jsonb_build_object(
  'clicksLoaded', (select count(*)::int from clicks),
  'clicksLast24h', (select count(*)::int from clicks, bounds where clicked_at >= bounds.day_at),
  'analyticsLoaded', (select total from analytics),
  'analyticsLast24h', (select last24h from analytics),
  'byVertical', (select data from by_vertical),
  'byProvider', (select data from by_provider),
  'recentClicks', (select items from recent),
  'funnel', (select data from funnel)
);
$function$;
