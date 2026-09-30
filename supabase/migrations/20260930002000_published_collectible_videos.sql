create extension if not exists pgcrypto;

create table if not exists public.published_collectible_videos (
  id uuid primary key default gen_random_uuid(),
  research_run_id text not null unique
    check (research_run_id ~ '^rv-[a-f0-9]{16}$'),
  title text not null,
  vertical text not null default 'other_collectible',
  video_url text not null check (video_url ~ '^https://'),
  channels jsonb not null default '[]'::jsonb,
  buffer_post_ids jsonb not null default '{}'::jsonb,
  campaign_id text,
  status text not null default 'published'
    check (status in ('published', 'partial')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.published_collectible_videos enable row level security;

create unique index if not exists published_collectible_videos_research_run_id_idx
  on public.published_collectible_videos (research_run_id);

create index if not exists published_collectible_videos_published_at_idx
  on public.published_collectible_videos (published_at desc);
