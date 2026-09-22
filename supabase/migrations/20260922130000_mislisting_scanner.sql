create table if not exists public.mislisting_flags (
  id uuid primary key default gen_random_uuid(),
  watch_item_id text not null,
  listing_id text not null,
  title text not null,
  price numeric,
  currency text,
  reason text not null,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  expires_at timestamptz not null,
  unique(watch_item_id, listing_id)
);
alter table public.mislisting_flags enable row level security;
revoke all on public.mislisting_flags from anon, authenticated;

create table if not exists public.mislisting_scan_runs (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz not null,
  browse_calls integer not null check (browse_calls between 0 and 500),
  flag_count integer not null check (flag_count between 0 and 5000),
  github_run_id text,
  commit_sha text,
  created_at timestamptz not null default now()
);
alter table public.mislisting_scan_runs enable row level security;
revoke all on public.mislisting_scan_runs from anon, authenticated;
