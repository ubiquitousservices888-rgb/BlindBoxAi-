# Owner control center restoration

Restores the owner-only UI routes that were intentionally replaced with `notFound()` in commit 8bb40f864f4a16c78144b21fccf2199c7df89c14.

- `/owner-dashboard` renders the existing `DashboardClient` and links to media upload.
- `/media-upload` renders the existing `MediaUploadForm`.
- Both routes remain `noindex, nofollow`.
- Existing owner API authorization and explicit per-video approval gates are unchanged.
- Public collector homepage is unchanged.
