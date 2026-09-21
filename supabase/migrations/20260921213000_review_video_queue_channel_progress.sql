alter table public.review_video_queue
  add column if not exists published_channels text[] not null default '{}',
  add column if not exists buffer_post_ids jsonb not null default '{}'::jsonb;

alter table public.review_video_queue
  add constraint review_video_queue_published_channels_bounded
  check (cardinality(published_channels) <= 16);
