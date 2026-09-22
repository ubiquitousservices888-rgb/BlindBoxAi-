alter table public.review_video_queue
  add column if not exists public_urls jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'review_video_queue_public_urls_object_check'
      and conrelid = 'public.review_video_queue'::regclass
  ) then
    alter table public.review_video_queue
      add constraint review_video_queue_public_urls_object_check
      check (jsonb_typeof(public_urls) = 'object');
  end if;
end $$;


-- Historical published rows predate strict platform URL validation. Requeue all
-- of them to the already-owner-approved state so the protected publisher must
-- locate and strictly verify the actual public post URL before completion.
update public.review_video_queue
set
  status = 'approved',
  published_at = null,
  publishing_at = null,
  last_error = 'Public URL re-verification required after schema upgrade',
  updated_at = now()
where status = 'published'
  and cardinality(coalesce(published_channels, array[]::text[])) > 0;
