import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const journal = resolve(root, ".mutation-state.json");
const hash = (text) => createHash("sha256").update(text).digest("hex");
function restore() {
  if (!existsSync(journal)) return;
  const saved = JSON.parse(readFileSync(journal, "utf8"));
  const path = resolve(root, saved.file);
  if (relative(root, path).startsWith(".."))
    throw new Error(
      "Mutation journal escapes the dashboard. Inspect it manually.",
    );
  const current = readFileSync(path, "utf8");
  if (hash(current) !== saved.mutantHash && current !== saved.original)
    throw new Error(
      `Concurrent edit in ${saved.file}. Original is retained in .mutation-state.json; reconcile it manually.`,
    );
  writeFileSync(path, saved.original);
  unlinkSync(journal);
}
restore();
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});
const unitOnly = process.argv.includes("--unit");
function run(file, title) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/playwright/cli.js",
      "test",
      ...(unitOnly ? ["--config", "playwright.unit.config.ts"] : []),
      ...(file ? [file] : []),
      ...(title ? ["--grep", title] : []),
      "--reporter=json",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 12 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `Test runner failed before reporting assertions.\n${result.stderr}\n${result.stdout.slice(-2000)}`,
    );
  }
  return { result, report };
}
const replace = (from, to) => (source) => {
  const changed = source.replace(from, to);
  if (changed === source) throw new Error(`Mutation target moved: ${from}`);
  return changed;
};
const mutants = [
  {
    name: "cross-session draft loss",
    file: "src/platform/session-view-state.ts",
    change: replace("views.set(id,", "views.clear(); views.set(id,"),
    test: "domain.spec.ts",
    title: "local interaction state",
  },
  {
    name: "owner authority ignored",
    file: "src/platform/capabilities.ts",
    change: replace("if (capability.authorised !== true)", "if (false)"),
    test: "domain.spec.ts",
    title: "capability evidence",
  },
  {
    name: "unknown outcome promoted",
    file: "src/data/adapters.ts",
    change: replace(/: "outcome_unknown"/, ': "completed"'),
    test: "domain.spec.ts",
    title: "unrecognised outcomes",
  },
  {
    name: "stream tied to mounted conversation",
    file: "src/features/messenger/page.tsx",
    change: replace(
      "function Conversation({ id }: { id: string }) {",
      "function Conversation({ id }: { id: string }) { useEffect(() => () => runs.dispose(), [id]);",
    ),
    test: "messenger.spec.ts",
    title: "a running session keeps",
  },
  {
    name: "duplicate events accepted twice",
    file: "src/data/runs.ts",
    change: (source) =>
      replace(
        /&&\s*event.id > \(message.streamCursor \?\? 0\)/,
        "",
      )(
        replace(
          /if\s*\(event.id <= \(this.cursors.get\(event.runId\) \?\? 0\)\)\s*return;/,
          "",
        )(source),
      ),
    test: "messenger.spec.ts",
    title: "duplicate events",
  },
  {
    name: "expired request approved",
    file: "src/mocks/handlers.ts",
    change: replace(
      /if\s*\(\s*approval.decision !== "pending" \|\|\s*approval.revision !== input.revision\s*\)/,
      "if (false)",
    ),
    test: "shared-records.spec.ts",
    title: "expiry before acceptance",
  },
  {
    name: "unknown execution hidden",
    file: "src/components/action-record.tsx",
    change: replace('if (action.status === "outcome_unknown")', "if (false)"),
    test: "shared-records.spec.ts",
    title: "missing execution receipt",
  },
  {
    name: "deleted citation not tombstoned",
    file: "src/mocks/handlers.ts",
    change: replace("citation.deleted = true;", "citation.deleted = false;"),
    test: "shared-records.spec.ts",
    title: "a deleted citation",
  },
  {
    name: "theme control inert",
    file: "src/components/shell.tsx",
    change: replace(
      "<ThemeToggle />",
      '<Button variant="outline">Use light theme</Button>',
    ),
    test: "shell.spec.ts",
    title: "dark theme really",
  },
  {
    name: "Reply contribution missing",
    file: "src/app/features.ts",
    change: (source) =>
      source.replace(
        /(export const features: Feature\[\] = \[)([\s\S]*?)(\];)/,
        (_, prefix, body, suffix) =>
          prefix + body.replace(/replyFeature\s*,?/, "") + suffix,
      ),
    test: "features.spec.ts",
    title: "Reply and emotion contribute",
  },
  {
    name: "emotion contribution missing",
    file: "src/app/features.ts",
    change: (source) =>
      source.replace(
        /(export const features: Feature\[\] = \[)([\s\S]*?)(\];)/,
        (_, prefix, body, suffix) =>
          prefix + body.replace(/,?\s*emotionFeature/, "") + suffix,
      ),
    test: "features.spec.ts",
    title: "Reply and emotion contribute",
  },
  {
    name: "unbounded message toolbar",
    file: "src/platform/slots.tsx",
    change: replace(
      /name === "message.actions"\s*\? 2/,
      'name === "message.actions" ? 10',
    ),
    test: "features.spec.ts",
    title: "Reply and emotion contribute",
  },
];
mutants.push(
  {
    name: "Chats opens a detail",
    file: "src/features/messenger/page.tsx",
    change: replace(
      "export function Messenger() {",
      'export function Messenger() { if (window.location.pathname === "/chat") return <Conversation id="week" />;',
    ),
    test: "navigation.spec.ts",
    title: "Chats is a full-width list",
  },
  {
    name: "search drops Agents mode",
    file: "src/features/messenger/page.tsx",
    change: replace('mode === "sessions"', 'mode === "sessions" || !!search'),
    test: "navigation.spec.ts",
    title: "Chats is a full-width list",
  },
  {
    name: "title face opens Studio",
    file: "src/components/shell.tsx",
    change: replace(
      /to="\/"(\s+aria-label="Companion home")/,
      'to="/companion"$1',
    ),
    test: "navigation.spec.ts",
    title: "Home and the title face",
  },
  {
    name: "Home forgets chosen conversation",
    file: "src/features/messenger/page.tsx",
    change: replace(
      'contactSession("home", query.data.sessionIds[0])',
      "query.data.sessionIds[0]",
    ),
    test: "navigation.spec.ts",
    title: "Home and the title face",
  },
  {
    name: "navigation collapse inert",
    file: "src/components/shell.tsx",
    change: replace("setNavHidden(!navHidden)", "setNavHidden(false)"),
    test: "navigation.spec.ts",
    title: "chrome toggles independently",
  },
  {
    name: "contact collapse inert",
    file: "src/features/messenger/page.tsx",
    change: replace(
      "setContactsHidden(!contactsHidden)",
      "setContactsHidden(false)",
    ),
    test: "navigation.spec.ts",
    title: "chrome toggles independently",
  },
  {
    name: "chrome preferences not persisted",
    file: "src/platform/chrome-preferences.ts",
    change: replace(
      "localStorage.setItem(key, JSON.stringify(preferences));",
      "",
    ),
    test: "navigation.spec.ts",
    title: "chrome toggles independently",
  },
  {
    name: "Inbox preopens detail",
    file: "src/pages/inbox.tsx",
    change: replace("!id ? (", "false ? ("),
    test: "navigation.spec.ts",
    title: "Inbox rows lead",
  },
  {
    name: "management opens first detail",
    file: "src/features/management/pages.tsx",
    change: replace(
      "const { id } = useParams();",
      'const { id = "conker" } = useParams();',
    ),
    test: "navigation.spec.ts",
    title: "every management collection",
  },
  {
    name: "accepted activity leaves stale recency",
    file: "src/mocks/handlers.ts",
    change: replace("session.updatedAt = new Date().toISOString();", ""),
    test: "navigation.spec.ts",
    title: "accepted activity reorders",
  },
  {
    name: "session cache not refreshed",
    file: "src/data/runs.ts",
    change: replace('refresh("journal", "sessions")', 'refresh("journal")'),
    test: "navigation.spec.ts",
    title: "accepted activity reorders",
  },
  {
    name: "string false enabled",
    file: "src/platform/capabilities.ts",
    change: replace("capability.supported !== true", "!capability.supported"),
    test: "domain.spec.ts",
    title: "string false capability",
  },
  {
    name: "warnings depend on fixture ID",
    file: "src/pages/inbox.tsx",
    change: replace(
      "item.intentEvidence?.matches === false",
      'item.id === "cleanup"',
    ),
    test: "correctness.spec.ts",
    title: "approval warnings follow evidence",
  },
  {
    name: "Saved survives edits",
    file: "src/features/character-studio/page.tsx",
    change: replace("savedProfile === JSON.stringify(profile)", "true"),
    test: "correctness.spec.ts",
    title: "Studio clears Saved",
  },
  {
    name: "removed asset keeps dangling mapping",
    file: "src/features/character-studio/page.tsx",
    change: replace("mapped === asset.id ? null : mapped", "mapped"),
    test: "correctness.spec.ts",
    title: "Studio clears Saved",
  },
);
mutants.push(
  {
    name: "loading Inbox reports zero decisions",
    file: "src/pages/inbox.tsx",
    change: replace("!loading && !unavailable &&", "true &&"),
    test: "correctness.spec.ts",
    title: "Inbox distinguishes loading",
  },
  {
    name: "neutral fallback omitted",
    file: "src/features/character-studio/portrait.tsx",
    change: replace('[expression, "neutral"]', "[expression]"),
    test: "correctness.spec.ts",
    title: "dangling portrait mappings",
  },
  {
    name: "inspector scroll restoration omitted",
    file: "src/features/messenger/page.tsx",
    change: replace(', params.get("inspect")]', "]"),
    test: "messenger.spec.ts",
    title: "policy inspector restores",
  },
);
console.log("Checking the unmodified baseline first…");
const baseline = run();
if (
  baseline.result.status !== 0 ||
  baseline.report.stats?.unexpected ||
  baseline.report.errors?.length
)
  throw new Error(
    "Baseline failed. Fix dependency/startup/test failures before mutation testing; no mutant was applied.",
  );
let caught = 0;
for (const mutant of mutants.filter(
  (item) => !unitOnly || item.test === "domain.spec.ts",
)) {
  const path = resolve(root, mutant.file);
  const original = readFileSync(path, "utf8");
  const changed = mutant.change(original);
  if (changed === original)
    throw new Error(`Mutation target moved: ${mutant.name}`);
  writeFileSync(
    journal,
    JSON.stringify({ file: mutant.file, original, mutantHash: hash(changed) }),
  );
  try {
    writeFileSync(path, changed);
    const { result, report } = run(mutant.test, mutant.title);
    const specs = [];
    const visit = (suites) =>
      suites?.forEach((suite) => {
        specs.push(...(suite.specs ?? []));
        visit(suite.suites);
      });
    visit(report.suites);
    const failedAssertion = specs.some(
      (spec) =>
        spec.title.includes(mutant.title) &&
        spec.tests.some((test) =>
          test.results.some(
            (result) =>
              result.status === "failed" &&
              result.error?.message?.includes("expect("),
          ),
        ),
    );
    if (result.status === 0 || !failedAssertion || report.errors?.length)
      throw new Error(
        `${mutant.name}: survived or failed without the intended assertion. Inspect its Playwright report.`,
      );
    caught++;
    console.log(`Caught: ${mutant.name}`);
  } finally {
    restore();
  }
}
console.log(`${caught} mutants caught. Original sources restored.`);
