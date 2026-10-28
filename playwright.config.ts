import { defineConfig } from "@playwright/test";

// Drives the built app. Run `npm run test:app`, which builds it first.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One window at a time: each test starts its own copy of Shelf.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
