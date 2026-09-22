alter table public.review_video_queue
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'review_video_queue_rejection_reason_check'
  ) then
    alter table public.review_video_queue
      add constraint review_video_queue_rejection_reason_check
      check (rejection_reason is null or rejection_reason in ('duplicate','owner_rejected','test'));
  end if;
end $$;

update public.review_video_queue
set status = 'rejected',
    rejection_reason = 'duplicate',
    rejected_at = now(),
    updated_at = now()
where research_run_id = 'rv-dc3fe87a26bf3dd7'
  and status = 'failed';
