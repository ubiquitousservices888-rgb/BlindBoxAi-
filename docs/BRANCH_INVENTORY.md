# Branch Inventory

**Snapshot date:** 2026-09-26  
**Repository:** `ubiquitousservices888-rgb/BlindBoxAi-`  
**Branches observed:** 237

This is a read-only cleanup manifest. **Nothing in this file authorizes deletion.** Branch deletion is destructive and requires a separate explicit owner approval after review.

## Classification method

This file is a point-in-time summary of GitHub branch state, open/closed pull requests, merged PR head SHAs, and `main...branch` comparisons. It is not embedded raw evidence and must be regenerated before any cleanup action.

Reproduce the snapshot inputs with GitHub CLI:

```bash
REPO='ubiquitousservices888-rgb/BlindBoxAi-'

# Branch names and exact head SHAs.
gh api --paginate "repos/$REPO/branches?per_page=100" \
  --jq '.[] | [.name, .commit.sha] | @tsv'

# PR state and merged head references.
gh pr list --repo "$REPO" --state all --limit 1000 \
  --json number,state,mergedAt,headRefName,headRefOid,title

# Per-branch comparison against main. URL-encode branch names containing '/'.
gh api --paginate "repos/$REPO/branches?per_page=100" --jq '.[].name' |
while IFS= read -r branch; do
  encoded="$(python -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$branch")"
  gh api "repos/$REPO/compare/main...$encoded" \
    --jq --arg branch "$branch" '[ $branch, .status, .ahead_by, .behind_by, .head_commit.sha ] | @tsv'
done
```

Each inventory row records the branch head SHA observed for this snapshot. Because PR #230 changes while this file is being reviewed, its own listed head is necessarily a historical snapshot value rather than a self-updating live head.

A branch is a deletion candidate only when at least one of these is true:

1. its current head exactly matches the head of a merged PR;
2. its current head exactly matches another branch head already proven merged; or
3. GitHub compare reports `ahead_by=0`, meaning the branch has no commits absent from `main`.

Anything with commits ahead of `main` stays in review, even when an older PR from the same branch was merged.

## Summary

| Group | Count |
|---|---:|
| Keep: main/open PR | 4 |
| Deletion candidates (snapshot classification) | 192 |
| Diverged/review required | 41 |
| Total | 237 |

Detailed categories:

- `DELETE_CANDIDATE_ANCESTOR_OF_MAIN`: 23
- `DELETE_CANDIDATE_DUPLICATE_MERGED_SHA`: 4
- `DELETE_CANDIDATE_MERGED_PR`: 165
- `KEEP_MAIN`: 1
- `KEEP_OPEN_PR`: 3
- `REVIEW_DIVERGED_CLOSED_UNMERGED`: 23
- `REVIEW_DIVERGED_POST_MERGE`: 1
- `REVIEW_DIVERGED_UNKNOWN`: 17

## Keep

| Branch | Head | Classification evidence |
|---|---|---|
| `docs/state-convergence-20260926` | `776d0a1db258` | Open PR #230: Reconcile BlindBoxAI state and documentation authority |
| `feat/browser-use-agent-memory` | `81fdb3b77939` | Open PR #228: Add read-only Browser Use agent memory for BlindBoxAI |
| `feat/diagram-as-code` | `ca440c5aff0e` | Open PR #229: Add Diagram-as-Code tooling for BlindBoxAI architecture |
| `main` | `7e0eaa0cc887` | Default branch. |

## Review required — unique commits remain

These branches have commits absent from `main`. They are **not deletion candidates** until their unique commits are inspected and deliberately retained or rejected.

| Branch | Head | Classification evidence |
|---|---|---|
| `codex/fix-all` | `8ead0d2498b7` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=302; PR #80 closed unmerged. |
| `codex/fix-github-actions-job-failure-again` | `c11b725b318f` | GitHub compare main...branch: diverged, ahead_by=14, behind_by=302; no PR evidence. |
| `codex/fix-github-actions-job-yet-again` | `1b671f6830ef` | GitHub compare main...branch: diverged, ahead_by=14, behind_by=302; PR #82 closed unmerged. |
| `codex/split-blindboxai-affiliate-routing` | `c9d4f30c7658` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=302; PR #78 closed unmerged. |
| `copilot/copilotpull-reauest` | `79dda6e9292f` | GitHub compare main...branch: diverged, ahead_by=2, behind_by=450; no PR evidence. |
| `copilot/create-hardening-implementation` | `65796e33d14e` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=446; no PR evidence. |
| `copilot/finish-labubu-buffer-automation` | `ce1624fc748b` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=454; no PR evidence. |
| `copilot/fix-affiliate-link-issues` | `88b3a4e43fec` | GitHub compare main...branch: diverged, ahead_by=3, behind_by=311; PR #69 closed unmerged. |
| `copilot/hardening-automation-task` | `c0cc8eecfaef` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=448; PR #2 closed unmerged. |
| `copilot/hardening-implementation` | `063a0e786c0b` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=446; no PR evidence. |
| `copilot/implement-product-classification-affiliate-routing` | `3c1222b4b840` | GitHub compare main...branch: diverged, ahead_by=20, behind_by=302; PR #79 closed unmerged. |
| `distribution/launch-loop-20260915` | `fe8173439156` | GitHub compare main...branch: diverged, ahead_by=5, behind_by=167; no PR evidence. |
| `docs/agents-protocol` | `6dcdd24c4712` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=144; no PR evidence. |
| `feat/fake-report-intake-20260922` | `d2d916993922` | GitHub compare main...branch: diverged, ahead_by=8, behind_by=80; PR #201 closed unmerged. |
| `feat/mislisting-scanner-v1-20260922` | `bf14a2439d92` | GitHub compare main...branch: diverged, ahead_by=20, behind_by=80; PR #202 closed unmerged. |
| `feat/monthly-acquisition-dossier-20260922` | `22b674bcc4c1` | GitHub compare main...branch: diverged, ahead_by=9, behind_by=80; PR #198 closed unmerged. |
| `feat/notebooklm-mobile-video-ingest` | `d51d2a65c3fe` | GitHub compare main...branch: diverged, ahead_by=39, behind_by=399; no PR evidence. |
| `feat/verified-price-pages-20260922` | `92ac00d24409` | GitHub compare main...branch: diverged, ahead_by=8, behind_by=80; PR #199 closed unmerged. |
| `feature/free-cookie-consent` | `9d4539886ebd` | GitHub compare main...branch: diverged, ahead_by=7, behind_by=360; PR #40 closed unmerged. |
| `feature/twinkle-buy-or-pass-free` | `e74775ab20fc` | GitHub compare main...branch: diverged, ahead_by=5, behind_by=360; PR #39 closed unmerged. |
| `fix/campaign-attribution-cookie` | `975e9f2a6db5` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=80; PR #204 closed unmerged. |
| `fix/free-storage-owner-dashboard-20260913` | `61b47a5e90d9` | GitHub compare main...branch: diverged, ahead_by=6, behind_by=260; earlier PR #108 merged but branch later diverged. |
| `know-it-all/public-research-latest` | `08b1e044659a` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=103; PR #175 closed unmerged. |
| `know-it-all/verification-34454830447` | `4396629068ed` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=280; no PR evidence. |
| `know-it-all/verification-34515729567` | `e26efa69ed86` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=279; no PR evidence. |
| `know-it-all/verification-34578415965` | `99df7e33785b` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=278; no PR evidence. |
| `know-it-all/verification-34634911765` | `af6a517b064e` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=278; no PR evidence. |
| `know-it-all/verification-34682439776` | `d2c404a04ec2` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=277; no PR evidence. |
| `know-it-all/verification-34709328585` | `5d31ea0e8afa` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=275; no PR evidence. |
| `know-it-all/verification-34774263428` | `c482228c2f53` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=259; no PR evidence. |
| `know-it-all/verification-34826818433` | `a6b8bc57ca6c` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=237; no PR evidence. |
| `know-it-all/verification-34889804595` | `f792dd040c6d` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=207; no PR evidence. |
| `know-it-all/verification-34949738353` | `a617cf2c350b` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=174; PR #128 closed unmerged. |
| `know-it-all/verification-35011986266` | `b0dd22a96990` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=174; PR #131 closed unmerged. |
| `know-it-all/verification-35138164361` | `b85f0b473962` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=159; PR #147 closed unmerged. |
| `know-it-all/verification-35202085074` | `58adfca484af` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=158; PR #148 closed unmerged. |
| `know-it-all/verification-35324525392` | `06288556e238` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=145; PR #157 closed unmerged. |
| `know-it-all/verification-35381234012` | `e1865c57dc49` | GitHub compare main...branch: diverged, ahead_by=1, behind_by=144; PR #160 closed unmerged. |
| `owner-dashboard-revenue-layer-2026-09-03` | `895a70ae6e09` | GitHub compare main...branch: diverged, ahead_by=73, behind_by=312; PR #67 closed unmerged. |
| `research/full-collectible-coverage` | `8ad29154e439` | GitHub compare main...branch: diverged, ahead_by=5, behind_by=259; PR #111 closed unmerged. |
| `security/owner-hardening` | `1db1c16b95a3` | GitHub compare main...branch: diverged, ahead_by=45, behind_by=378; PR #26 closed unmerged. |

## Deletion candidates — no unique commits relative to main / merged evidence

These 192 branches are candidates only. Do not delete from this document alone.

| Branch | Head | Classification evidence |
|---|---|---|
| `affiliate-analytics` | `f02264699817` | GitHub compare main...branch: behind, ahead_by=0, behind_by=454; branch has no commits absent from main. |
| `affiliate-money-magnet-2026-08-21` | `11e485f9ec6d` | PR #30 merged 2026-08-23T08:11:17Z; branch head exactly matches merged PR head. |
| `agent/autonomous-video-pipeline` | `ae2e71046158` | PR #4 merged 2026-08-09T17:11:01Z; branch head exactly matches merged PR head. |
| `agent/daily-blindbox-product` | `554277948618` | PR #5 merged 2026-08-10T21:20:17Z; branch head exactly matches merged PR head. |
| `agent/epn-api-auto-reporting` | `f9b781b52931` | PR #76 merged 2026-09-04T19:18:50Z; branch head exactly matches merged PR head. |
| `agent/epn-reporting-connect` | `57303e0c98ce` | PR #75 merged 2026-09-04T18:28:46Z; branch head exactly matches merged PR head. |
| `agent/generational-compounding-flywheel` | `296020f7f071` | PR #72 merged 2026-09-04T17:54:33Z; branch head exactly matches merged PR head. |
| `agent/harden-release-gate` | `28073e2c042b` | PR #9 merged 2026-08-15T18:58:04Z; branch head exactly matches merged PR head. |
| `agent/nick-ponte-inbound-seo` | `50c1d65c1ba1` | PR #31 merged 2026-08-23T08:11:20Z; branch head exactly matches merged PR head. |
| `agent/one-click-launch-ai-family` | `834ce4340d60` | PR #73 merged 2026-09-04T18:05:00Z; branch head exactly matches merged PR head. |
| `agent/reduce-blob-dashboard-reads` | `994bc54bdefc` | PR #77 merged 2026-09-05T07:52:39Z; branch head exactly matches merged PR head. |
| `agent/simple-video-review` | `681f02bb5b96` | PR #6 merged 2026-08-11T04:21:25Z; branch head exactly matches merged PR head. |
| `agent/yellow-review-button` | `cdebd1f4f1f9` | PR #74 merged 2026-09-04T18:16:31Z; branch head exactly matches merged PR head. |
| `analytics-unification-2026-09-03` | `84f6145f91da` | PR #66 merged 2026-09-03T11:48:22Z; branch head exactly matches merged PR head. |
| `automation/bounded-24x7-ops` | `86a9d5b468ee` | PR #29 merged 2026-08-23T08:08:37Z; branch head exactly matches merged PR head. |
| `automation/closed-loop-affiliate-20260824` | `20558e4c7933` | PR #35 merged 2026-08-24T20:19:55Z; branch head exactly matches merged PR head. |
| `automation/closed-loop-env-fix-20260824` | `d4c12efd657e` | PR #36 merged 2026-08-24T20:22:29Z; branch head exactly matches merged PR head. |
| `automation/expire-stale-staged-20260824` | `7818529e04fb` | PR #37 merged 2026-08-24T20:28:00Z; branch head exactly matches merged PR head. |
| `automation/social-epn-attribution-20260824` | `acd49a011159` | PR #38 merged 2026-08-25T04:43:42Z; branch head exactly matches merged PR head. |
| `backup/current-main-2026-09-18` | `7e585e22af51` | GitHub compare main...branch: behind, ahead_by=0, behind_by=141; branch has no commits absent from main. |
| `chore/discord-alerts` | `e2d54650ec4e` | PR #28 merged 2026-08-24T11:05:15Z; branch head exactly matches merged PR head. |
| `cleanup/remove-know-it-all-one-shot-20260921` | `22bbdf777ea7` | PR #180 merged 2026-09-21T20:16:48Z; branch head exactly matches merged PR head. |
| `cleanup/remove-tiktok-youtube-batch-once-20260921` | `a75a02e94ac2` | PR #194 merged 2026-09-22T01:40:53Z; branch head exactly matches merged PR head. |
| `codex/autonomous-transaction-verification` | `6bd8e44029ab` | PR #85 merged 2026-09-07T17:25:38Z; branch head exactly matches merged PR head. |
| `codex/fix-github-actions-job` | `4f079511b3e8` | Branch head exactly equals merged PR head #70. |
| `codex/fix-github-actions-job-again` | `f9b781b52931` | Branch head exactly equals merged PR head #76. |
| `codex/fix-github-actions-job-another-one` | `f9b781b52931` | Branch head exactly equals merged PR head #76. |
| `codex/fixed-to-wear-epn-epc-connects` | `8976412af3d9` | PR #81 merged 2026-09-07T17:02:25Z; branch head exactly matches merged PR head. |
| `codex/secure-autonomous-know-it-all` | `8ca2094b4cb9` | PR #84 merged 2026-09-07T17:17:56Z; branch head exactly matches merged PR head. |
| `content/hirono-mantel-clock-approved` | `fadcadfcfab8` | PR #8 merged 2026-08-15T05:43:33Z; branch head exactly matches merged PR head. |
| `copilot/blindboxai-repo-access-settings` | `cd6f0fb8b4bc` | GitHub compare main...branch: behind, ahead_by=0, behind_by=446; branch has no commits absent from main. |
| `copilot/hardening-automation-task-again` | `a68649e021d6` | PR #3 merged 2026-08-09T09:29:40Z; branch head exactly matches merged PR head. |
| `copilot/pull-reauest` | `f202544d524b` | PR #1 merged 2026-08-09T06:28:41Z; branch head exactly matches merged PR head. |
| `design/blindvault-layout` | `96058124fca3` | PR #109 merged 2026-09-13T20:40:20Z; branch head exactly matches merged PR head. |
| `diagnostic/buffer-organization-id` | `89e75ab2ec01` | PR #125 merged 2026-09-14T20:34:46Z; branch head exactly matches merged PR head. |
| `distribution/public-video-feed-20260917` | `4f4edf643acc` | PR #150 merged 2026-09-17T11:31:09Z; branch head exactly matches merged PR head. |
| `docs/add-blindboxai-agents-protocol-20260921` | `ee02cba9ec3d` | PR #182 merged 2026-09-21T21:23:05Z; branch head exactly matches merged PR head. |
| `feat/asking-sold-gap-badge-20260922` | `3d8f1690d31c` | PR #200 merged 2026-09-23T13:25:55Z; branch head exactly matches merged PR head. |
| `feat/deterministic-opportunity-gate` | `13249514249b` | PR #16 merged 2026-08-16T14:10:47Z; branch head exactly matches merged PR head. |
| `feat/enforce-visual-manifests` | `46dd91900c6f` | PR #20 merged 2026-08-16T20:48:25Z; branch head exactly matches merged PR head. |
| `feat/event-driven-collectible-attribution` | `f3f5bcdc26e0` | PR #15 merged 2026-08-16T13:41:51Z; branch head exactly matches merged PR head. |
| `feat/evidence-provenance-freshness` | `ee5d6ec26d58` | GitHub compare main...branch: behind, ahead_by=0, behind_by=389; branch has no commits absent from main. |
| `feat/mew-152-vs-158-guide` | `e7b68f3f5aab` | PR #218 merged 2026-09-23T19:21:08Z; branch head exactly matches merged PR head. |
| `feat/mr-know-it-all-owner-cards-20260920` | `8f2a7ce2d453` | PR #166 merged 2026-09-20T02:12:34Z; branch head exactly matches merged PR head. |
| `feat/owner-notification-dashboard` | `3b83fd7109e3` | PR #12 merged 2026-08-16T03:22:38Z; branch head exactly matches merged PR head. |
| `feat/provider-evidence-owner-funnel` | `43244e2d2475` | PR #208 merged 2026-09-22T20:39:42Z; branch head exactly matches merged PR head. |
| `feat/rejected-review-status-20260921` | `4fc1484ac27b` | PR #196 merged 2026-09-22T02:31:37Z; branch head exactly matches merged PR head. |
| `feat/verified-visual-asset-agent` | `bd8470b825cf` | PR #19 merged 2026-08-16T20:45:19Z; branch head exactly matches merged PR head. |
| `feat/vertical-attribution` | `8b68af360a2a` | PR #97 merged 2026-09-09T18:25:10Z; branch head exactly matches merged PR head. |
| `feat/visual-discovery-worker` | `453341986328` | PR #21 merged 2026-08-16T20:50:40Z; branch head exactly matches merged PR head. |
| `feature/amazon-associates-accessories` | `2333d429b3b6` | PR #68 merged 2026-09-04T01:59:12Z; branch head exactly matches merged PR head. |
| `feature/card-api-research-gate` | `192058b5f636` | PR #102 merged 2026-09-11T19:01:17Z; branch head exactly matches merged PR head. |
| `feature/collectible-price-verification` | `4ead26c1afc5` | GitHub compare main...branch: behind, ahead_by=0, behind_by=317; branch has no commits absent from main. |
| `feature/collectible-price-verification-final` | `4ead26c1afc5` | GitHub compare main...branch: behind, ahead_by=0, behind_by=317; branch has no commits absent from main. |
| `feature/collectible-price-verification-impl` | `4ead26c1afc5` | GitHub compare main...branch: behind, ahead_by=0, behind_by=317; branch has no commits absent from main. |
| `feature/collectible-price-verification-live` | `b955a9338ffc` | PR #62 merged 2026-09-03T08:01:37Z; branch head exactly matches merged PR head. |
| `feature/collectible-price-verification-real` | `4ead26c1afc5` | GitHub compare main...branch: behind, ahead_by=0, behind_by=317; branch has no commits absent from main. |
| `feature/collectible-price-verification-v2` | `4ead26c1afc5` | GitHub compare main...branch: behind, ahead_by=0, behind_by=317; branch has no commits absent from main. |
| `feature/collectible-price-verification-v3` | `4ead26c1afc5` | GitHub compare main...branch: behind, ahead_by=0, behind_by=317; branch has no commits absent from main. |
| `feature/continuous-sold-results` | `fb29205563e0` | PR #122 merged 2026-09-14T12:32:55Z; branch head exactly matches merged PR head. |
| `feature/family-core-readonly-client` | `04b2e39efe0b` | PR #103 merged 2026-09-12T15:40:21Z; branch head exactly matches merged PR head. |
| `feature/free-traffic-consent-integration` | `d09a11727751` | PR #41 merged 2026-08-25T06:40:45Z; branch head exactly matches merged PR head. |
| `feature/mr-know-it-all-memory` | `dc83f52775b5` | PR #114 merged 2026-09-13T20:59:20Z; branch head exactly matches merged PR head. |
| `feature/narrative-flywheel` | `862a22c51dd1` | PR #45 merged 2026-08-30T05:22:13Z; branch head exactly matches merged PR head. |
| `feature/owner-ebay-live-read-verify-2026-09-21` | `f882ea7e6fad` | PR #169 merged 2026-09-21T16:10:00Z; branch head exactly matches merged PR head. |
| `feature/owner-ebay-research-2026-09-21` | `88ae53305f04` | PR #168 merged 2026-09-21T13:34:11Z; branch head exactly matches merged PR head. |
| `feature/twinkle-shopping-gemini-2026-08-29` | `8e39fe62db5f` | PR #44 merged 2026-08-29T16:20:42Z; branch head exactly matches merged PR head. |
| `fix/amazon-associates-issues` | `dffe8d91be1c` | GitHub compare main...branch: behind, ahead_by=0, behind_by=311; branch has no commits absent from main. |
| `fix/amazon-beacon-click-quality` | `a9c9033f74f0` | PR #213 merged 2026-09-23T09:59:27Z; branch head exactly matches merged PR head. |
| `fix/amazon-video-landing-page` | `8b65187cf595` | PR #212 merged 2026-09-23T09:41:06Z; branch head exactly matches merged PR head. |
| `fix/ask-visual-results-20260916` | `10cd17edca62` | GitHub compare main...branch: behind, ahead_by=0, behind_by=158; branch has no commits absent from main. |
| `fix/autonomous-video-epn-campaign-id` | `93ce225b6b5e` | PR #95 merged 2026-09-08T18:46:37Z; branch head exactly matches merged PR head. |
| `fix/blob-upload-expiry` | `cb27a08da449` | GitHub compare main...branch: behind, ahead_by=0, behind_by=393; branch has no commits absent from main. |
| `fix/blob-upload-expiry-v2` | `da6170f5a1c8` | PR #13 merged 2026-08-16T03:01:24Z; branch head exactly matches merged PR head. |
| `fix/branded-accessory-routing` | `548afe0ecf2f` | PR #87 merged 2026-09-08T12:12:00Z; branch head exactly matches merged PR head. |
| `fix/buffer-public-media-guard` | `4593e3cf8a6e` | PR #10 merged 2026-08-16T00:50:40Z; branch head exactly matches merged PR head. |
| `fix/buffer-youtube-metadata-input-20260924` | `bd9262e0cc8e` | PR #223 merged 2026-09-25T00:11:23Z; branch head exactly matches merged PR head. |
| `fix/buffer-youtube-required-metadata` | `9abbb464d8b2` | GitHub compare main...branch: behind, ahead_by=0, behind_by=205; branch has no commits absent from main. |
| `fix/channel-aware-review-publisher-20260921` | `931581738660` | PR #192 merged 2026-09-22T01:27:14Z; branch head exactly matches merged PR head. |
| `fix/ci-ingest-isolation-20260917` | `e1bbf42f5fd2` | PR #151 merged 2026-09-17T15:58:34Z; branch head exactly matches merged PR head. |
| `fix/click-quality-gate` | `563b932b1684` | PR #210 merged 2026-09-22T21:01:28Z; branch head exactly matches merged PR head. |
| `fix/complete-copilot-review-sweep-20260904` | `4f079511b3e8` | PR #70 merged 2026-09-04T08:20:52Z; branch head exactly matches merged PR head. |
| `fix/control-panel-video-approval` | `6d7bb1b851b5` | PR #89 merged 2026-09-07T22:56:32Z; branch head exactly matches merged PR head. |
| `fix/copilot-review-backlog-2026-09-12` | `95274f175941` | PR #104 merged 2026-09-12T17:43:24Z; branch head exactly matches merged PR head. |
| `fix/creatomate-response-shape` | `74d76ad744bf` | PR #58 merged 2026-08-31T18:23:24Z; branch head exactly matches merged PR head. |
| `fix/cubic-consent-review-2026-08-25` | `903ecc01cd9b` | PR #43 merged 2026-08-25T09:09:37Z; branch head exactly matches merged PR head. |
| `fix/dashboard-degrade-gracefully` | `8bd841768f9b` | PR #155 merged 2026-09-17T23:48:32Z; branch head exactly matches merged PR head. |
| `fix/durable-telemetry-throttle` | `6010374f057d` | PR #209 merged 2026-09-22T20:42:44Z; branch head exactly matches merged PR head. |
| `fix/ebay-accept-language-2026-09-21` | `6211680651d3` | PR #171 merged 2026-09-21T16:53:36Z; branch head exactly matches merged PR head. |
| `fix/ebay-account-deletion-webhook` | `490e0fe70be1` | PR #48 merged 2026-08-30T08:02:34Z; branch head exactly matches merged PR head. |
| `fix/ebay-account-deletion-webhook-2` | `31fb8914fb80` | GitHub compare main...branch: behind, ahead_by=0, behind_by=352; branch has no commits absent from main. |
| `fix/ebay-classifier-fail-open` | `7f77e878dea9` | PR #214 merged 2026-09-23T10:19:29Z; branch head exactly matches merged PR head. |
| `fix/epn-campaign-secret-release-gate` | `0e34c8aafdfc` | PR #96 merged 2026-09-08T19:08:56Z; branch head exactly matches merged PR head. |
| `fix/epn-genai-video-compliance` | `38f2ad9b59b6` | PR #23 merged 2026-08-16T20:57:03Z; branch head exactly matches merged PR head. |
| `fix/epn-referrer` | `f52bb21742d5` | PR #211 merged 2026-09-23T09:11:03Z; branch head exactly matches merged PR head. |
| `fix/exact-review-row-dispatch-20260924` | `059e8f4bb122` | PR #225 merged 2026-09-25T01:15:19Z; branch head exactly matches merged PR head. |
| `fix/free-video-storage-supabase-20260913` | `075ec07fae62` | PR #107 merged 2026-09-13T15:36:38Z; branch head exactly matches merged PR head. |
| `fix/funnel-owner-auth-signup-telemetry` | `f5f94c7be60f` | PR #207 merged 2026-09-22T20:35:32Z; branch head exactly matches merged PR head. |
| `fix/gate-review-publisher` | `f0c3bd5038d4` | PR #159 merged 2026-09-18T15:28:06Z; branch head exactly matches merged PR head. |
| `fix/github-inbox-review-cleanup` | `ed358ae77dea` | PR #98 merged 2026-09-09T18:28:05Z; branch head exactly matches merged PR head. |
| `fix/human-only-question-reader-20260917` | `851df7ca77a4` | PR #152 merged 2026-09-17T17:08:43Z; branch head exactly matches merged PR head. |
| `fix/know-it-all-governed-persist-20260921` | `db8cface52fd` | PR #174 merged 2026-09-21T16:48:26Z; branch head exactly matches merged PR head. |
| `fix/know-it-all-oidc-supabase-persist-20260921` | `1fabc873e1cc` | PR #177 merged 2026-09-21T20:09:44Z; branch head exactly matches merged PR head. |
| `fix/know-it-all-protected-auto-promote-20260921` | `a9ed39e0e3b1` | PR #176 merged 2026-09-21T16:54:06Z; branch head exactly matches merged PR head. |
| `fix/know-it-all-protected-persistence` | `339dc4bc5dd7` | PR #91 merged 2026-09-08T10:57:32Z; branch head exactly matches merged PR head. |
| `fix/know-it-all-public-research-push-20260921` | `295699561394` | PR #172 merged 2026-09-21T16:44:11Z; branch head exactly matches merged PR head. |
| `fix/know-it-all-queue-capacity` | `fb30a6d3b60a` | PR #205 merged 2026-09-22T20:17:13Z; branch head exactly matches merged PR head. |
| `fix/know-it-all-verification-20260916` | `72870978b354` | GitHub compare main...branch: behind, ahead_by=0, behind_by=159; branch has no commits absent from main. |
| `fix/know-it-all-verification-20260916b` | `72870978b354` | GitHub compare main...branch: behind, ahead_by=0, behind_by=159; branch has no commits absent from main. |
| `fix/know-it-all-verification-20260916c` | `72870978b354` | GitHub compare main...branch: behind, ahead_by=0, behind_by=159; branch has no commits absent from main. |
| `fix/know-it-all-verification-20260916d` | `72870978b354` | GitHub compare main...branch: behind, ahead_by=0, behind_by=159; branch has no commits absent from main. |
| `fix/late-copilot-review-cleanup-2026-09-10` | `dc6422d3be91` | PR #100 merged 2026-09-10T08:41:25Z; branch head exactly matches merged PR head. |
| `fix/manual-video-traction-attribution-2026-09-12` | `34c53bc1e051` | PR #105 merged 2026-09-12T17:56:58Z; branch head exactly matches merged PR head. |
| `fix/marketing-source-outbound-path-20260916` | `415ca3f60a8b` | PR #143 merged 2026-09-16T08:40:10Z; branch head exactly matches merged PR head. |
| `fix/mobile-review-upload-speed` | `38068186ee4d` | GitHub compare main...branch: behind, ahead_by=0, behind_by=262; branch has no commits absent from main. |
| `fix/mr-know-it-all-cross-category` | `b909759641e0` | PR #110 merged 2026-09-13T20:40:05Z; branch head exactly matches merged PR head. |
| `fix/mr-know-it-all-freshness-confirmation-20260915` | `d2439958f27a` | PR #136 merged 2026-09-15T23:56:41Z; branch head exactly matches merged PR head. |
| `fix/mr-know-it-all-shared-verification-20260915` | `d363b1917ef4` | PR #135 merged 2026-09-15T22:40:05Z; branch head exactly matches merged PR head. |
| `fix/narrative-ci-hardening` | `db4b147ecc4f` | PR #46 merged 2026-08-30T05:36:32Z; branch head exactly matches merged PR head. |
| `fix/narrative-instant-money-filter` | `e1b66adced67` | PR #47 merged 2026-08-30T07:58:46Z; branch head exactly matches merged PR head. |
| `fix/owned-waitlist-task1-20260924` | `d04178083fcc` | PR #220 merged 2026-09-24T14:50:43Z; branch head exactly matches merged PR head. |
| `fix/owner-approve-launch-control-code-20260921` | `64d5395083c2` | PR #183 merged 2026-09-21T21:27:37Z; branch head exactly matches merged PR head. |
| `fix/owner-card-epn-allowlist` | `dc6ed7f53c4b` | PR #167 merged 2026-09-20T10:46:53Z; branch head exactly matches merged PR head. |
| `fix/owner-dashboard-auth-boundary` | `8c0f2b701616` | PR #206 merged 2026-09-22T20:32:55Z; branch head exactly matches merged PR head. |
| `fix/owner-ebay-inventory-verify-2026-09-21` | `5e529aba21bd` | PR #170 merged 2026-09-21T16:30:29Z; branch head exactly matches merged PR head. |
| `fix/owner-upload-auth-boundary-20260921` | `f1c79bf64960` | PR #191 merged 2026-09-22T00:38:52Z; branch head exactly matches merged PR head. |
| `fix/pin-review-video-channels-20260924` | `9ebf1f31fc3a` | PR #222 merged 2026-09-24T23:33:12Z; branch head exactly matches merged PR head. |
| `fix/pro-attribution-instrumentation-20260923` | `34ab58972909` | PR #219 merged 2026-09-23T21:26:08Z; branch head exactly matches merged PR head. |
| `fix/production-review-publishing-20260920` | `a1bb8b1ffa01` | PR #165 merged 2026-09-20T01:14:16Z; branch head exactly matches merged PR head. |
| `fix/public-trust-audit-20260915` | `883f1291c9a7` | PR #134 merged 2026-09-15T22:19:45Z; branch head exactly matches merged PR head. |
| `fix/public-video-titles` | `5b880b757e16` | PR #163 merged 2026-09-19T08:07:25Z; branch head exactly matches merged PR head. |
| `fix/rejected-status-db-constraint-20260921` | `50af7bba1609` | PR #197 merged 2026-09-22T02:33:57Z; branch head exactly matches merged PR head. |
| `fix/release-gate-test-env` | `5343e192fb14` | PR #92 merged 2026-09-08T11:57:31Z; branch head exactly matches merged PR head. |
| `fix/require-live-publish-verification-20260922` | `1457eba4c558` | PR #203 merged 2026-09-23T13:27:28Z; branch head exactly matches merged PR head. |
| `fix/resolve-historical-copilot-findings-20260902` | `f00300c45c61` | PR #59 merged 2026-09-02T10:31:11Z; branch head exactly matches merged PR head. |
| `fix/restore-owner-control-center` | `f124084fa009` | Branch head exactly equals merged PR head #154. |
| `fix/restore-owner-control-center-final` | `f124084fa009` | PR #154 merged 2026-09-17T21:26:53Z; branch head exactly matches merged PR head. |
| `fix/review-publisher-channel-resume-20260921` | `ad93a04cc3d1` | PR #185 merged 2026-09-21T21:42:15Z; branch head exactly matches merged PR head. |
| `fix/review-publisher-dry-run-peek-20260921` | `af6357ed3b64` | PR #186 merged 2026-09-21T21:46:16Z; branch head exactly matches merged PR head. |
| `fix/review-publisher-safety-cap-20260921` | `a0975fab003c` | PR #184 merged 2026-09-21T21:33:10Z; branch head exactly matches merged PR head. |
| `fix/review-queue-claim-hardening` | `b47361ba4bc7` | PR #226 merged 2026-09-25T23:32:28Z; branch head exactly matches merged PR head. |
| `fix/review-test-name-20260924` | `00d860fd95ea` | PR #224 merged 2026-09-25T00:15:16Z; branch head exactly matches merged PR head. |
| `fix/review-upload-blue-push-button` | `2871d9c4f4ff` | GitHub compare main...branch: behind, ahead_by=0, behind_by=283; branch has no commits absent from main. |
| `fix/review-video-twitter-default-20260923` | `d9567d3f6923` | PR #217 merged 2026-09-23T21:21:26Z; branch head exactly matches merged PR head. |
| `fix/scope-publish-order-regression-20260902` | `ff3185199d7e` | PR #60 merged 2026-09-02T10:42:51Z; branch head exactly matches merged PR head. |
| `fix/server-campaign-attribution-20260915` | `821f406988f1` | PR #140 merged 2026-09-16T01:56:42Z; branch head exactly matches merged PR head. |
| `fix/server-rendered-utm-source-20260915` | `a402d5ebd4bd` | PR #142 merged 2026-09-16T04:41:00Z; branch head exactly matches merged PR head. |
| `fix/sold-only-raw-graded-research` | `daf29cc5a14f` | PR #113 merged 2026-09-13T20:51:32Z; branch head exactly matches merged PR head. |
| `fix/source-only-internal-nav-20260915` | `5e21f73b225e` | PR #141 merged 2026-09-16T04:21:17Z; branch head exactly matches merged PR head. |
| `fix/supabase-private-question-reader-20260917` | `0d49eb601d88` | PR #149 merged 2026-09-17T11:07:09Z; branch head exactly matches merged PR head. |
| `fix/supabase-telemetry-20260915` | `c2c1f0a315d5` | PR #137 merged 2026-09-16T01:11:44Z; branch head exactly matches merged PR head. |
| `fix/telemetry-existing-auth-20260915` | `701d46a96fdd` | PR #138 merged 2026-09-16T01:32:26Z; branch head exactly matches merged PR head. |
| `fix/transaction-verification-pr-churn-20260918` | `07b82697263b` | PR #161 merged 2026-09-18T20:39:07Z; branch head exactly matches merged PR head. |
| `fix/transaction-verification-workflow-yaml` | `25f3fc3540f7` | PR #162 merged 2026-09-19T06:15:55Z; branch head exactly matches merged PR head. |
| `fix/validate-video-source-dates-20260902` | `e3cdad60ed05` | PR #61 merged 2026-09-02T10:50:47Z; branch head exactly matches merged PR head. |
| `fix/verified-badge-requires-two-sources` | `f9c7af91e076` | PR #86 merged 2026-09-07T18:19:21Z; branch head exactly matches merged PR head. |
| `fix/verified-evidence-display` | `fa154b828035` | PR #101 merged 2026-09-10T20:40:03Z; branch head exactly matches merged PR head. |
| `fix/video-channels-youtube-tiktok` | `3af1d3fcfa38` | PR #18 merged 2026-08-16T17:16:40Z; branch head exactly matches merged PR head. |
| `fix/video-publish-handoff` | `02cdd98b28c6` | PR #17 merged 2026-08-16T17:07:33Z; branch head exactly matches merged PR head. |
| `fix/video-quality-gate` | `e54f4d34dc9c` | PR #57 merged 2026-08-31T07:55:10Z; branch head exactly matches merged PR head. |
| `fix/video-render-trigger-cost-20260921` | `39291a3bd95e` | PR #181 merged 2026-09-21T20:19:48Z; branch head exactly matches merged PR head. |
| `fix/video-targets-youtube-tiktok` | `781f48b59a47` | PR #227 merged 2026-09-26T08:31:55Z; branch head exactly matches merged PR head. |
| `fix/visual-discovery-match-confidence` | `e014f73bdcdf` | PR #22 merged 2026-08-16T20:54:15Z; branch head exactly matches merged PR head. |
| `fix/visual-hold-workflow-state` | `0680eb04c7db` | PR #24 merged 2026-08-16T21:01:04Z; branch head exactly matches merged PR head. |
| `fix/waitlist-hardening-20260924` | `5a6755163e07` | PR #221 merged 2026-09-24T15:11:31Z; branch head exactly matches merged PR head. |
| `fix/workflow-publish-schedule-regression-20260921` | `20585af3a913` | PR #195 merged 2026-09-22T02:26:24Z; branch head exactly matches merged PR head. |
| `fix/workflow-yaml-colon` | `3890795f5157` | PR #32 merged 2026-08-23T08:16:06Z; branch head exactly matches merged PR head. |
| `flywheel-skullpanda-2026-09-03` | `e069bd816d30` | PR #63 merged 2026-09-03T11:15:26Z; branch head exactly matches merged PR head. |
| `know-it-all-card-batch-2026-09-17` | `577d6fdb0a6d` | PR #156 merged 2026-09-18T20:40:11Z; branch head exactly matches merged PR head. |
| `know-it-all/verification-34747904545` | `eda4697cd631` | PR #106 merged 2026-09-13T15:10:07Z; branch head exactly matches merged PR head. |
| `know-it-all/verification-35075903855` | `72870978b354` | GitHub compare main...branch: behind, ahead_by=0, behind_by=159; branch has no commits absent from main. |
| `know-it-all/verification-35263608125` | `8cf4495e46c5` | PR #153 merged 2026-09-17T20:43:45Z; branch head exactly matches merged PR head. |
| `know-it-all/verification-latest` | `edb4727f0d38` | PR #164 merged 2026-09-20T10:08:42Z; branch head exactly matches merged PR head. |
| `non-youtube-partnerships-2026-09-03` | `a3aaf2869d17` | PR #65 merged 2026-09-03T11:32:23Z; branch head exactly matches merged PR head. |
| `noop-check` | `b00d5ec82288` | GitHub compare main...branch: behind, ahead_by=0, behind_by=388; branch has no commits absent from main. |
| `ops/publish-approved-tiktok-then-youtube-once-20260921` | `59b3a10d38ed` | PR #193 merged 2026-09-22T01:30:19Z; branch head exactly matches merged PR head. |
| `ops/publish-pokemon-youtube-once-20260921` | `625ef3a01ebe` | PR #189 merged 2026-09-21T23:18:57Z; branch head exactly matches merged PR head. |
| `ops/remove-publish-pokemon-youtube-once-20260921` | `b50888386952` | PR #190 merged 2026-09-21T23:21:35Z; branch head exactly matches merged PR head. |
| `ops/remove-review-publisher-default-dry-run-one-shot-20260921` | `f27ce40b5db3` | PR #188 merged 2026-09-21T21:50:05Z; branch head exactly matches merged PR head. |
| `ops/review-publisher-default-dry-run-one-shot-20260921` | `4a0f3c614338` | PR #187 merged 2026-09-21T21:47:29Z; branch head exactly matches merged PR head. |
| `p0-compliance-launch` | `172ee3c7fbea` | PR #25 merged 2026-08-17T14:17:24Z; branch head exactly matches merged PR head. |
| `partnership-flywheel-2026-09-03` | `675f165d0f58` | PR #64 merged 2026-09-03T11:22:43Z; branch head exactly matches merged PR head. |
| `public/customer-only-home` | `fe69cdedead4` | PR #133 merged 2026-09-15T22:00:57Z; branch head exactly matches merged PR head. |
| `research/all-sports-collector-cards` | `793b37f172a4` | PR #94 merged 2026-09-08T15:53:14Z; branch head exactly matches merged PR head. |
| `research/full-collectible-coverage-v2` | `f2e33f5f529f` | PR #112 merged 2026-09-13T20:43:10Z; branch head exactly matches merged PR head. |
| `research/high-value-collectibles-flywheel` | `0022cdf9d764` | PR #93 merged 2026-09-08T12:50:24Z; branch head exactly matches merged PR head. |
| `safety/review-publish-dry-run` | `faab6adba28c` | PR #158 merged 2026-09-18T20:39:00Z; branch head exactly matches merged PR head. |
| `security/restrict-rls-auto-enable-20260921` | `c3cd3a4369b0` | PR #178 merged 2026-09-21T20:13:00Z; branch head exactly matches merged PR head. |
| `test/ebay-fail-open-review-fixes` | `e82cc8b333cd` | PR #215 merged 2026-09-23T10:40:06Z; branch head exactly matches merged PR head. |
| `test/know-it-all-main-run-20260921` | `bd9b50e27f64` | PR #173 merged 2026-09-21T16:45:59Z; branch head exactly matches merged PR head. |
| `test/know-it-all-one-shot-dispatch-20260921` | `ac7068c1d68d` | PR #179 merged 2026-09-21T20:14:28Z; branch head exactly matches merged PR head. |
| `vercel/install-and-configure-vercel-w-j5mvh1` | `b1c14b639173` | PR #11 merged 2026-08-16T01:25:16Z; branch head exactly matches merged PR head. |

## Cleanup gate

Before deleting any branch:

1. confirm it is still in a deletion-candidate class;
2. confirm it is not the head of a newly opened PR;
3. confirm no automation references the branch by name;
4. present the exact deletion set to the owner;
5. receive explicit deletion approval;
6. delete in small batches and verify `main` plus open PRs remain intact.
