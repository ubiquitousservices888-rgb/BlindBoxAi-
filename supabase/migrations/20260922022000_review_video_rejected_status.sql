alter table public.review_video_queue
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'review_video_queue_rejection_reason_check'
      and conrelid = 'public.review_video_queue'::regclass
  ) then
    alter table public.review_video_queue
      add constraint review_video_queue_rejection_reason_check
      check (
        (status = 'rejected'
          and rejection_reason in ('duplicate','owner_rejected','test')
          and rejected_at is not null)
        or (status is distinct from 'rejected'
          and rejection_reason is null
          and rejected_at is null)
      );
  end if;
end $$;

update public.review_video_queue
set status = 'rejected',
    rejection_reason = 'duplicate',
    rejected_at = now(),
    publishing_at = null,
    updated_at = now()
where research_run_id = 'rv-dc3fe87a26bf3dd7'
  and status = 'failed';
