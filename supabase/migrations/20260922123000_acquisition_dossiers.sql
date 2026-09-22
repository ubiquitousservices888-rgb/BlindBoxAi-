create table if not exists public.acquisition_dossiers (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  generated_at timestamptz not null default now(),
  payload jsonb not null,
  markdown text not null,
  github_run_id text,
  commit_sha text,
  unique(period_start, period_end)
);

alter table public.acquisition_dossiers enable row level security;

revoke all on public.acquisition_dossiers from anon, authenticated;
