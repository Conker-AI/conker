import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "domain.spec.ts",
  workers: 1,
});
