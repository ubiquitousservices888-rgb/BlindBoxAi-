# Free video storage failover

BlindBoxAI review uploads use an owner-authenticated signed-upload broker backed by Supabase Storage when the Vercel Blob Hobby store is suspended.

Security properties:
- owner code is validated by BlindBoxAI before a signed upload is issued
- Supabase service-role credentials remain server-side inside the Edge Function
- upload tickets expire and are scoped to one `media/review/*.mp4` path
- bucket is restricted to MP4 files up to 100 MB
- uploaded videos remain `READY_FOR_REVIEW`; one owner Blue approval approves the exact item, dispatches one serialized YouTube + TikTok run, and approves only that exact run at the existing `social-production` gate
- invalid public titles are repaired deterministically instead of blocking launch; the phone uploader still checks YouTube Short dimensions/duration, and the publisher independently probes the hosted file before a YouTube post, including rotation and cover-art handling; BlindBoxAI requires at least one second and 240 pixels on the shortest side as a quality floor
- no purchasing, outreach, or automatic approval authority is added

The legacy Vercel Blob upload route is retained for compatibility but is not used by the standalone `/media-upload` phone flow while the store is suspended.
