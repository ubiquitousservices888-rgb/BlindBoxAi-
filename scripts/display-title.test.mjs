import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as policy from "../lib/review-own-product.mjs";

const published = (title, name = "display-fixture") => {
  const video_url = `https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/${name}.mp4`;
  return Object.freeze({ title, status: "published", video_url, research_run_id: `rv-${createHash("sha256").update(video_url).digest("hex").slice(0, 16)}` });
};

test("public display uses canonical title without modifying exact reviewed identity", () => {
  for (const [title, expected] of [["The fake check Field guide for gumroad", "The Fake-Check Field Guide"], ["Sports Card Collecting Series on Gumroad", "Sports Card Collecting Series"]]) {
    const row = published(title);
    const reviewed = { ...row, status: "publishing" };
    const before = policy.bindOwnProductPolicy(reviewed).forReceipt(row.research_run_id, row.video_url, "youtube");
    assert.equal(policy.publicOwnProductDisplayTitle(row), expected);
    assert.equal(row.title, title);
    assert.deepEqual(policy.bindOwnProductPolicy(reviewed).forReceipt(row.research_run_id, row.video_url, "youtube"), before);
  }
});

test("unrecognized, partial, unreviewed or identity-mismatched display rows keep their stored title", () => {
  const row = published("The fake check Field guide for gumroad");
  for (const other of [published("Pokemon field research"), { ...row, status: "partial" }, { ...row, status: "ready_for_review" }, { ...row, status: "rejected" }, { ...row, research_run_id: "rv-1111111111111111" }, { ...row, video_url: row.video_url.replace("display-fixture", "swapped") }]) {
    assert.equal(policy.publicOwnProductDisplayTitle(other), other.title);
  }
});

test("previous explicit bundle selection retains the original canonical public title for display only", () => {
  const row = Object.freeze({ research_run_id: "rv-46e2ab7acda58ff9", title: "The fake test field guide", status: "published", video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/1795749758411-4643.mp4" });
  assert.equal(policy.publicOwnProductDisplayTitle(row), "The Fake-Check Field Guide");
  assert.equal(row.title, "The fake test field guide");
  assert.equal(policy.publicOwnProductDisplayTitle({ ...row, video_url: row.video_url.replace("4643", "9999") }), row.title);
});
