export const jobFixtures = [
  {
    id: "nightly",
    name: "Make sense of the day",
    description:
      "Look for useful patterns in new conversation evidence. Prepare suggestions, never decisions.",
    agent: "Conker",
    schedule: "Every night · 02:00",
    last: "Today, 02:00",
    next: "Tomorrow, 02:00",
    produced: "One suggestion: keep Sunday’s revision short.",
    source: "/inbox/revision",
    watermark: "msg_fixture_0184",
    duration: "38 seconds",
    cost: "Unknown · inference receipt missing",
  },
  {
    id: "backup",
    name: "Keep a way back",
    description:
      "Capture authoritative stores and recovery material. Verify the snapshot manifest.",
    agent: "System",
    schedule: "Every night · 03:00",
    last: "Today, 03:00",
    next: "Tomorrow, 03:00",
    produced:
      "4.2 GB snapshot. Manifest verified; no restore drill for this snapshot.",
    source: "/system",
    watermark: "snapshot_2026-09-12_0300",
    duration: "2 minutes 14 seconds",
    cost: "$0 · local storage operation",
  },
  {
    id: "weekly",
    name: "Leave Sunday a little lighter",
    description:
      "Collect unfinished commitments into a draft weekly plan, ready when you want it.",
    agent: "Conker",
    schedule: "Sundays · 17:00",
    last: "6 September, 17:00",
    next: "Tomorrow, 17:00",
    produced: "A draft week plan with two open questions.",
    source: "/chat/week",
    watermark: "week_2026-09-06",
    duration: "24 seconds",
    cost: "Unknown · local usage not metered",
  },
];
