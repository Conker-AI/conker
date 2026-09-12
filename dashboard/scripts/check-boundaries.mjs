import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const rules = [
  [
    "network client",
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
  ],
  ["remote endpoint", /https?:\/\//],
  ["literal colour", /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/i],
  ["font family outside the design system", /font-family\s*:/i],
  ["persistent browser data", /\b(?:localStorage|sessionStorage|indexedDB)\b/],
];
const failures = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(tsx?|css)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      for (const [label, pattern] of rules) {
        if (pattern.test(source))
          failures.push(`${relative(root, path)}: ${label}`);
      }
    }
  }
}
await inspect(root);
if (failures.length) {
  console.error(failures.join("\n"));
  console.error(
    "Keep preview data in src/fixtures and use design-system tokens.",
  );
  process.exitCode = 1;
} else console.log("Fixture boundary and design-token checks passed.");
