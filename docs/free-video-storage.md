# Free video storage failover

BlindBoxAI review uploads use an owner-authenticated signed-upload broker backed by Supabase Storage when the Vercel Blob Hobby store is suspended.

Security properties:
- owner code is validated by BlindBoxAI before a signed upload is issued
- Supabase service-role credentials remain server-side inside the Edge Function
- upload tickets expire and are scoped to one `media/review/*.mp4` path
- bucket is restricted to MP4 files up to 100 MB
- uploaded videos remain `READY_FOR_REVIEW` and still require the existing blue owner approval gate before social publishing
- no purchasing, outreach, or automatic approval authority is added

The legacy Vercel Blob upload route is retained for compatibility but is not used by the standalone `/media-upload` phone flow while the store is suspended.
