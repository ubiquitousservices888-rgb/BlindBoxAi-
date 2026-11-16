import assert from "node:assert/strict";
import test from "node:test";

import { parseLookupResponse } from "../lib/ask-response.mjs";

function response(status, value, invalidJson = false) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (invalidJson) throw new SyntaxError("invalid JSON");
      return value;
    },
  };
}

test("successful appraisal response requires the matches payload", async () => {
  await assert.rejects(
    parseLookupResponse(response(200, undefined, true)),
    (error) => error.analyticsFailureType === "service_unavailable",
  );
  await assert.rejects(
    parseLookupResponse(response(200, {})),
    (error) => error.analyticsFailureType === "service_unavailable",
  );
  assert.deepEqual(await parseLookupResponse(response(200, { matches: [] })), { matches: [] });
});

test("non-JSON HTTP failures keep the status-based analytics classification", async () => {
  await assert.rejects(
    parseLookupResponse(response(503, undefined, true)),
    (error) => error.analyticsFailureType === "service_unavailable",
  );
  await assert.rejects(
    parseLookupResponse(response(400, undefined, true)),
    (error) => error.analyticsFailureType === "request_rejected",
  );
});
