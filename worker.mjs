// Household Worker entry (wrangler.jsonc `main`). Wraps the OpenNext worker and
// adds `scheduled` for the daily keep-awake ping (src/lib/keep-awake.ts).
// Build first: `npm run build:worker` writes `.open-next/worker.js`.
import openNextWorker from "./.open-next/worker.js";
import { pingInstallDatabase } from "./src/lib/keep-awake.ts";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const worker = {
  fetch: openNextWorker.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(pingInstallDatabase(env));
  },
};

export default worker;
