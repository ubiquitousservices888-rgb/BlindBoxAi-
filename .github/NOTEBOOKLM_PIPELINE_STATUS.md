# NotebookLM Pipeline Status

Branch: `feat/notebooklm-mobile-video-ingest`

Implemented:
- Android/Termux MP4 ingest command
- Vercel Blob public hosting
- verified-product-only caption/CTA generation
- READY_FOR_REVIEW state
- existing manual approve/reject gate
- existing Buffer duplicate prevention and retry path
- NotebookLM ingest tests
- Termux quickstart

Still requires one-time credentials/configuration:
- public Vercel Blob store token
- Buffer API token and organization ID
- eBay EPN campaign ID configured on BlindBoxAI deployment

The downloaded NotebookLM MP4 is not committed to GitHub.
