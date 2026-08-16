# Media upload hardening

The owner upload flow is optimized for mobile reliability while preserving the approval gate.

- Blob client authorization is valid for two hours, well below Vercel's documented seven-day maximum.
- Files at or above 5 MB use multipart upload for resilience.
- The browser aborts an upload after 30 minutes instead of hanging indefinitely.
- Expired-token and timeout failures show explicit retry guidance.
- A successful upload is not considered complete until Vercel Blob returns a public HTTPS URL.
- Upload completion does not publish content; normal BlindBoxAI preflight and approval gates still apply.
