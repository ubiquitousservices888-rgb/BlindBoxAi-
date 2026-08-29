import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = [
  "twinkle-twinkle-why-so-serious-plush.json",
  "twinkle-twinkle-be-a-little-star-plush.json",
  "we-are-twinkle-twinkle-plush.json",
];

for (const name of names) {
  test(`${name} has completed-sale evidence but remains blocked until sell-through is current`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(root, "data", "series", name), "utf8"));
    assert.equal(data.marketSelection.priorityIp, "Twinkle Twinkle");
    assert.equal(data.marketSelection.format, "plush");
    assert.equal(data.marketSelection.completedSalesStatus, "verified");
    assert.equal(data.marketSelection.sellThroughStatus, "requires-current-active-listing-snapshot");
    assert.equal(data.marketSelection.autoPromote, false);
    assert.ok(data.figures.some((figure) => figure.needsReview === false && /Reviewed eBay completed transaction/.test(figure.evidence)));
  });
}
