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

-- Historical published rows must remain published. They predate strict public URL
-- verification, and changing them back to approved would make already-published
-- videos eligible for creation again. Backfill/verification of public_urls is a
-- separate read/reconciliation task and must never reactivate publication state.
