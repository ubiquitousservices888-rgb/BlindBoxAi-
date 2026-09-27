import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3205";

export default defineConfig({
  testDir: "./qa/e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- -p 3205 -H 127.0.0.1",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      CI: "true",
      SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      EVIDENCE_UPLOAD_CODE: "",
      BUFFER_API_TOKEN: "",
      BLINDBOXAI_ALLOW_TEST_INGEST: "false",
    },
  },
});
