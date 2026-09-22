create table if not exists public.authenticity_reports (
  id uuid primary key default gen_random_uuid(),
  item_query text not null,
  report_text text not null,
  photo_path text,
  status text not null default 'pending_owner_review'
    check (status in ('pending_owner_review','reviewed','rejected')),
  authenticity_tier text
    check (authenticity_tier is null or authenticity_tier = 'C'),
  source text not null default 'public_fake_report',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.authenticity_reports enable row level security;
revoke all on public.authenticity_reports from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blindboxai-authenticity-reports',
  'blindboxai-authenticity-reports',
  false,
  4194304,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
