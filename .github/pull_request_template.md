## Purpose and approved scope

Describe the problem, requested behavior, exact files changed, and any protected actions affected.

## Pre-push verification (attach raw evidence, not another AI's summary)

- [ ] Confirmed repository, approved change scope, and starting branch/head SHA
- [ ] Read the complete target files, relevant callers/tests, and executing CI job
- [ ] Inspected final source and exact diff; changed-file list contains only approved paths
- [ ] Checked syntax/compilation of changed code before push, or explicitly marked UNVERIFIED
- [ ] Ran the relevant tests, including positive/negative regression cases for safety guards, or explicitly marked UNVERIFIED
- [ ] Checked that owner approval, publish/payment/authentication, and secret-handling gates remain intact
- [ ] Recorded exact commands and complete unedited output (or linked retained run artifacts)

## Post-push verification

- [ ] Re-read pushed file and confirmed the exact new head commit
- [ ] Verified the required release-gate jobs for that **same head SHA**
- [ ] Addressed review comments with evidence; no open safety blockers
- [ ] Reported remaining risks, UNVERIFIED checks, and whether merged/deployed

**Commit SHA:** `<sha>`

**CI run link:** `<url>`

**Tests and evidence:** `<commands/output or links>`

**Remaining risks / unverified:** `<details or none>`

**Merge/deploy authorization:** `<approved / not approved>`

Note: checkboxes are a review prompt; they do not replace executable CI or separate owner authorization.
