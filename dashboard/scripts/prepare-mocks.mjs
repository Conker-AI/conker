import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
try {
  const worker = require.resolve("msw/mockServiceWorker.js");
  const directory = new URL("../public/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await copyFile(worker, new URL("mockServiceWorker.js", directory));
} catch (error) {
  console.error(
    "MSW is required for this fixture-only app. Run npm install in dashboard, then retry.",
  );
  console.error(error.message);
  process.exitCode = 1;
}
