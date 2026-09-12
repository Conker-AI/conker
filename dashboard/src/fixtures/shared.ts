import type { StatusEvidence } from "../ui";

// Evidence is captured once per preview, never fabricated by a screen from config.
export const previewStartedAt = new Date().toISOString();
export const fixtureLive = (detail?: string): StatusEvidence => ({
  state: "live",
  source: "Fixture receipt",
  checkedAt: previewStartedAt,
  staleAfterMs: 3_600_000,
  detail,
});
export const ownerFixture = {
  name: "Alexey",
  initials: "AL",
  companion: "Conker",
};
export const demoReply =
  "Let’s keep it small. Pick one thing you want off your mind, and we can work through it together. This is a scripted preview reply; no model or service was called.";
