// `npm audit` for the dashboard, failing on moderate and above except advisories listed here.
// An entry needs a reason and goes as soon as a patched release exists (then audit fails it).
const { execFileSync } = require("node:child_process");

const ACCEPTED = {
  // picomatch <= 4.0.7 has no patched release. Only build tools use it (vite, eslint, tinyglobby)
  // on patterns we write ourselves; nothing of it ships in the dashboard bundle.
  "GHSA-fc5q-39xc-vjpf": "picomatch ReDoS, no patched release, build tooling only",
};

let out;
try {
  out = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", shell: process.platform === "win32" });
} catch (e) {
  out = e.stdout; // npm audit exits 1 when it finds anything
}
const report = JSON.parse(out);
const levels = ["moderate", "high", "critical"];
const found = new Map();
for (const v of Object.values(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via === "object" && levels.includes(via.severity)) {
      found.set(via.url, `${via.name}: ${via.title} (${via.severity})`);
    }
  }
}
const rejected = [...found].filter(([url]) => !ACCEPTED[url.split("/").pop()]);
for (const [url, what] of found) {
  const reason = ACCEPTED[url.split("/").pop()];
  console.log(`${reason ? "accepted" : "FAIL    "} ${url} ${what}${reason ? ` - ${reason}` : ""}`);
}
if (rejected.length) process.exit(1);
console.log(`npm audit: ${found.size} accepted advisories, nothing else at moderate or above`);
