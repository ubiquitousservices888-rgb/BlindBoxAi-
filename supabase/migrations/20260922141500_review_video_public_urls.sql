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


-- Historical rows may have channel completion markers from before public URL
-- evidence was required. Return those rows to the already-owner-approved state
-- so the protected publisher can re-verify the existing Buffer post before any
-- future completion is accepted.
update public.review_video_queue
set
  status = 'approved',
  published_at = null,
  publishing_at = null,
  last_error = 'Public URL verification required after schema upgrade',
  updated_at = now()
where status = 'published'
  and exists (
    select 1
    from unnest(coalesce(published_channels, array[]::text[])) as channel_name
    where not (public_urls ? channel_name)
  );
