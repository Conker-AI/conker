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
    change: replace("if (!capability.authorised)", "if (false)"),
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
