create table if not exists public.mr_know_it_all_public_research_runs (
  id uuid primary key default gen_random_uuid(),
  artifact_hash text not null unique check (artifact_hash ~ '^[a-f0-9]{64}$'),
  researched_at timestamptz not null,
  finding_count integer not null check (finding_count >= 0 and finding_count <= 100),
  source_count integer not null check (source_count >= 0 and source_count <= 100),
  github_run_id text,
  commit_sha text check (commit_sha is null or commit_sha ~ '^[a-f0-9]{40}$'),
  event_name text check (event_name is null or event_name in ('schedule','workflow_dispatch')),
  artifact jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.mr_know_it_all_public_research_runs enable row level security;

comment on table public.mr_know_it_all_public_research_runs is
  'Server-only sanitized Mr. Know It All public research snapshots ingested from authorized GitHub Actions via Supabase Edge Function OIDC validation.';

create index if not exists mr_know_it_all_public_research_runs_researched_at_idx
  on public.mr_know_it_all_public_research_runs (researched_at desc);
