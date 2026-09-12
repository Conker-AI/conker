import { test, expect } from "@playwright/test";
import { capabilityReason, commandReason } from "../src/platform/capabilities";
import { createRegistry } from "../src/platform/contributions";
import { readView, updateView } from "../src/platform/session-view-state";
import { adaptRecord, adaptList } from "../src/data/adapters";
import { MessageCircle } from "lucide-react";

test("capability evidence keeps support authority and applicability distinct", () => {
  expect(capabilityReason(undefined, "reply")).toContain("unavailable");
  expect(
    capabilityReason(
      [{ id: "reply", supported: false, authorised: true }],
      "reply",
    ),
  ).toContain("Not supported");
  expect(
    capabilityReason(
      [{ id: "reply", supported: true, authorised: false }],
      "reply",
    ),
  ).toContain("not authorised");
  expect(
    commandReason(
      {
        id: "reply",
        label: "Reply",
        icon: MessageCircle,
        available: () => false,
        handler: () => {},
      },
      { selection: { kind: "none" }, navigate: () => {} },
      [],
    ),
  ).toContain("selection");
  const registry = createRegistry([
    {
      id: "unshipped",
      shipped: false,
      commands: [
        {
          id: "hidden",
          label: "Hidden",
          icon: MessageCircle,
          available: () => true,
          handler: () => {},
        },
      ],
    },
  ]);
  expect(registry.commands).toEqual([]);
});
test("local interaction state is isolated by session identity", () => {
  updateView("unit-a", {
    draft: "Russian: утром",
    replyTo: "message-a",
    scrollTop: 120,
  });
  updateView("unit-b", {
    draft: "English: morning",
    replyTo: "message-b",
    scrollTop: 60,
  });
  expect(readView("unit-a")).toMatchObject({
    draft: "Russian: утром",
    replyTo: "message-a",
    scrollTop: 120,
  });
  expect(readView("unit-b")).toMatchObject({
    draft: "English: morning",
    replyTo: "message-b",
    scrollTop: 60,
  });
});
test("unrecognised outcomes and unknown charges never become success or zero", () => {
  expect(
    adaptRecord("actions", { id: "a", tool: "mail.send", args: {} }, "a"),
  ).toMatchObject({ status: "outcome_unknown" });
  expect(
    adaptRecord("runs", { id: "r", sessionId: "s", status: "completed" }, "r"),
  ).toMatchObject({ costUsd: null });
  expect(() => adaptList("actions", { ok: true })).toThrow(
    "not an empty collection",
  );
  expect(() =>
    adaptRecord("approvals", { id: "a", decision: "approved" }, "a"),
  ).toThrow("revision");
});
