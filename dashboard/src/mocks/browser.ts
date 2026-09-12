import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { markMockReady } from "../data/client";

export async function startMocks() {
  const worker = setupWorker(...handlers);
  await worker.start({ quiet: true, onUnhandledRequest(request, print) {
    if (new URL(request.url).pathname.startsWith("/__fixture/")) print.error();
  } });
  markMockReady();
  return () => worker.stop();
}
