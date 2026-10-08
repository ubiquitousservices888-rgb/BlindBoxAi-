import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPartnershipSafety,
  buildPartnershipCandidate,
  partnershipScore,
  partnershipEvidenceStatus,
  PARTNERSHIP_EVIDENCE_MAX_AGE_MS,
  rankPartnershipOpportunities,
} from "../lib/partnership-flywheel.mjs";

const now = new Date("2026-09-03T12:00:00Z");
const opportunities = [
  {
    id: "inactive-youtube",
    name: "Inactive YouTube Lane",
    organization: "YouTube",
    type: "sponsorship_discovery",
    active: false,
    sourceUrl: "https://example.com/youtube",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Test-only inactive opportunity.",
    requirements: [],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles", "youtube"],
    riskFlags: ["inactive-by-owner"],
  },
  {
    id: "ambassador",
    name: "Collector Ambassador Program",
    organization: "Example Collector Marketplace",
    type: "ambassador_affiliate",
    active: true,
    sourceUrl: "https://example.com/ambassador",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Verified public collector ambassador program.",
    requirements: ["review"],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles", "ambassador"],
    riskFlags: ["affiliate-not-sponsorship"],
  },
  {
    id: "affiliate",
    name: "Blind Box Affiliate Program",
    organization: "Example Collectibles Store",
    type: "affiliate",
    active: true,
    sourceUrl: "https://example.com/affiliate",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Verified public blind-box affiliate program.",
    requirements: [],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles", "blind-box", "affiliate", "website"],
    riskFlags: ["affiliate-not-sponsorship"],
  },
];

test("inactive opportunities are excluded from ranking", () => {
  const ranked = rankPartnershipOpportunities(opportunities, { focusTerms: ["collectibles", "youtube"], now });
  assert.equal(ranked.some(({ opportunity }) => opportunity.id === "inactive-youtube"), false);
});

test("non-YouTube collector opportunities rank normally", () => {
  const ranked = rankPartnershipOpportunities(opportunities, { focusTerms: ["collectibles", "blind-box", "affiliate", "ambassador", "website"], now });
  assert.notEqual(ranked[0].opportunity.organization, "YouTube");
  assert.equal(ranked[0].opportunity.id, "affiliate");
});

test("candidate remains review-only and never auto-contacts", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  assert.equal(candidate.state, "READY_FOR_REVIEW");
  assert.equal(candidate.contactAutomatically, false);
  assert.equal(candidate.applyAutomatically, false);
  assert.equal(candidate.spendAutomatically, false);
  assert.equal(candidate.seeker.status, "NO_CONTACT_SENT");
  assert.equal(candidate.selected.eligibilityStatus, "unknown");
  assert.notEqual(candidate.selected.organization, "YouTube");
});

test("safety rejects automatic outreach", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  candidate.contactAutomatically = true;
  assert.throws(() => assertPartnershipSafety(candidate), /must not auto-contact/);
});

test("safety rejects false endorsement claims", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  candidate.outreachBrief.positioning = "Official partner of Example Collectibles Store";
  assert.throws(() => assertPartnershipSafety(candidate), /blocked claim/);
});

test("selection-not-guaranteed receives the same risk penalty as equivalent flags", () => {
  const base = opportunities[2];
  const unflagged = { ...base, riskFlags: [] };
  const selection = { ...base, riskFlags: ["selection-not-guaranteed"] };
  const approval = { ...base, riskFlags: ["approval-not-guaranteed"] };
  assert.equal(partnershipScore(selection, { now }), partnershipScore(approval, { now }));
  assert.ok(partnershipScore(selection, { now }) < partnershipScore(unflagged, { now }));
});

test("staging excludes expired evidence and writes a truthful needs-research artifact", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "partnership-stage-"));
  try {
    const input = path.join(tmp, "source.json");
    const output = path.join(tmp, "output");
    const oldDate = new Date(Date.now() - 45 * 86400000).toISOString();
    fs.writeFileSync(input, JSON.stringify({ opportunities: [{
      id: "old-affiliate", name: "Old Affiliate", organization: "Example Store",
      type: "affiliate", active: true, sourceUrl: "https://example.com/affiliate",
      checkedAt: oldDate, evidence: "Previously checked evidence.", eligibilityStatus: "unknown",
    }] }));
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "partnership-flywheel-stage.mjs");
    const stdout = execFileSync(process.execPath, [script], {
      env: { ...process.env, PARTNERSHIP_OPPORTUNITIES_FILE: input, PARTNERSHIP_OUTPUT_DIR: output }, encoding: "utf8",
    });
    const status = JSON.parse(fs.readFileSync(path.join(output, "status.json"), "utf8"));
    assert.equal(status.state, "NEEDS_FRESH_RESEARCH");
    assert.equal(status.recentCount, 0);
    assert.deepEqual(status.excluded.map((item) => item.id), ["old-affiliate"]);
    assert.equal(fs.existsSync(path.join(output, "candidate.json")), false);
    assert.match(stdout, /NEEDS_FRESH_RESEARCH/);
    assert.match(fs.readFileSync(path.join(output, "preview.md"), "utf8"), /last checked/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("staging ranks fresh opportunities without reviving expired evidence", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "partnership-stage-"));
  try {
    const input = path.join(tmp, "source.json");
    const output = path.join(tmp, "output");
    const base = {
      type: "affiliate", active: true, sourceUrl: "https://example.com/affiliate",
      evidence: "Evidence checked for testing.", eligibilityStatus: "unknown", fitTags: ["collectibles"],
    };
    fs.writeFileSync(input, JSON.stringify({ opportunities: [
      { ...base, id: "expired", name: "Expired", organization: "Expired Store", checkedAt: new Date(Date.now() - 45 * 86400000).toISOString() },
      { ...base, id: "recent", name: "Recent", organization: "Recent Store", checkedAt: new Date(Date.now() - 86400000).toISOString() },
    ] }));
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "partnership-flywheel-stage.mjs");
    execFileSync(process.execPath, [script], {
      env: { ...process.env, PARTNERSHIP_OPPORTUNITIES_FILE: input, PARTNERSHIP_OUTPUT_DIR: output }, encoding: "utf8",
    });
    const status = JSON.parse(fs.readFileSync(path.join(output, "status.json"), "utf8"));
    const candidate = JSON.parse(fs.readFileSync(path.join(output, "candidate.json"), "utf8"));
    assert.equal(status.state, "READY_FOR_REVIEW");
    assert.equal(status.recentCount, 1);
    assert.deepEqual(status.excluded.map((item) => item.id), ["expired"]);
    assert.equal(candidate.selected.id, "recent");
    assert.equal(candidate.contactAutomatically, false);
    assert.equal(candidate.applyAutomatically, false);
    assert.equal(candidate.spendAutomatically, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test("evidence timestamps require completed-check UTC, reject future, and share a 30-day cutoff", () => {
  const point = new Date("2026-10-08T13:00:00Z");
  assert.equal(PARTNERSHIP_EVIDENCE_MAX_AGE_MS, 30 * 86400000);
  assert.equal(partnershipEvidenceStatus("2026-10-08T12:59:59Z", point), "fresh");
  assert.equal(partnershipEvidenceStatus("2026-10-08T12:59:59.000Z", point), "fresh");
  assert.equal(partnershipEvidenceStatus("2026-10-08", point), "invalid-checkedAt");
  assert.equal(partnershipEvidenceStatus(undefined, point), "invalid-checkedAt");
  assert.equal(partnershipEvidenceStatus("2026-02-30T12:00:00Z", point), "invalid-checkedAt");
  assert.equal(partnershipEvidenceStatus("2026-10-08T13:00:01Z", point), "future-dated");
  assert.equal(partnershipEvidenceStatus(new Date(point.getTime() - PARTNERSHIP_EVIDENCE_MAX_AGE_MS).toISOString(), point), "fresh");
  assert.equal(partnershipEvidenceStatus(new Date(point.getTime() - PARTNERSHIP_EVIDENCE_MAX_AGE_MS - 1).toISOString(), point), "stale");
});

test("staging reports missing and invalid timestamps without selecting them", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "partnership-invalid-"));
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "partnership-flywheel-stage.mjs");
  const input = path.join(tmp, "source.json");
  const output = path.join(tmp, "output");
  const base = {
    name: "Affiliate", organization: "Example Store", type: "affiliate",
    active: true, sourceUrl: "https://example.com/affiliate",
    evidence: "Test-only evidence.", eligibilityStatus: "unknown",
  };
  const run = (records) => {
    fs.writeFileSync(input, JSON.stringify({ opportunities: records }));
    execFileSync(process.execPath, [script], {
      env: { ...process.env, PARTNERSHIP_OPPORTUNITIES_FILE: input, PARTNERSHIP_OUTPUT_DIR: output },
      encoding: "utf8",
    });
    return JSON.parse(fs.readFileSync(path.join(output, "status.json"), "utf8"));
  };
  try {
    const invalids = [
      { ...base }, // no id or checkedAt
      { ...base, id: "date-only", checkedAt: "2026-10-08" },
      { ...base, id: "future", checkedAt: new Date(Date.now() + 86400000).toISOString() },
    ];
    let status = run(invalids);
    assert.equal(status.state, "NEEDS_FRESH_RESEARCH");
    assert.equal(fs.existsSync(path.join(output, "candidate.json")), false);
    assert.deepEqual(status.excluded.map(({ id, reason }) => [id, reason]), [
      ["unknown", "invalid-checkedAt"],
      ["date-only", "invalid-checkedAt"],
      ["future", "future-dated"],
    ]);
    assert.equal(status.excluded[0].checkedAt, null);

    status = run([...invalids, {
      ...base, id: "fresh", checkedAt: new Date(Date.now() - 86400000).toISOString(),
    }]);
    assert.equal(status.state, "READY_FOR_REVIEW");
    assert.equal(status.recentCount, 1);
    const candidate = JSON.parse(fs.readFileSync(path.join(output, "candidate.json"), "utf8"));
    assert.equal(candidate.selected.id, "fresh");
    assert.equal(candidate.contactAutomatically, false);
    assert.equal(candidate.applyAutomatically, false);
    assert.equal(candidate.spendAutomatically, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
