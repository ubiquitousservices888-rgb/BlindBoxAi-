# js-sha256 browser ESM artifact

Vendored unchanged from the upstream `v0.12.0` tag (commit `7de3689e3c0a4beded1cc5e836f9bcfb1771c89f`). The MIT license is preserved in `LICENSE.txt`.

- Artifact: https://github.com/emn178/js-sha256/blob/7de3689e3c0a4beded1cc5e836f9bcfb1771c89f/build/sha256.min.mjs
- Readable upstream build: https://github.com/emn178/js-sha256/blob/7de3689e3c0a4beded1cc5e836f9bcfb1771c89f/build/sha256.mjs
- Git blob SHA: `cbcdcaa0b50cac7da4d46e7c7fe98941b5ffa5e7`
- License blob SHA: `b7d785dcab7badbd2842b21ab02f8b557acd09c4`

Only the incremental SHA-256 API is used by the review uploader. Existing SHA-256 storage identities remain unchanged. The application reads at most 256 KiB per slice; no whole-file ArrayBuffer is requested. No runtime CDN or package installation is needed. To update, review the upstream source and security advisories, pin a release/commit, preserve the license, and run the identity regression suite (including native Node SHA-256 parity and the maximum-size fixture). Do not hand-edit the upstream artifact.
