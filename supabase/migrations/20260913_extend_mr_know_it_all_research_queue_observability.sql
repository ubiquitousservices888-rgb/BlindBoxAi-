alter table public.mr_know_it_all_research_queue
  add column if not exists last_note text;

alter table public.mr_know_it_all_research_queue
  add column if not exists last_result jsonb not null default '{}'::jsonb;

create index if not exists mr_know_it_all_research_queue_ready_idx
  on public.mr_know_it_all_research_queue (status, next_attempt_at, priority desc, created_at)
  where status = 'queued';
