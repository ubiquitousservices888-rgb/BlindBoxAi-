import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const dashboard = fs.readFileSync(new URL("./DashboardClient.jsx", import.meta.url), "utf8");
const backend = fs.readFileSync(new URL("../../lib/owner-dashboard.js", import.meta.url), "utf8");

test("owner dashboard never renders missing affiliate reporting as confirmed zero revenue", () => {
  assert.match(dashboard, /Not connected/);
  assert.match(backend, /Reporting not connected/);
  assert.match(backend, /reporting pending Amazon approval/);
  assert.match(backend, /earnings: null/);
  assert.doesNotMatch(backend, /earnings:\s*0/);
});
