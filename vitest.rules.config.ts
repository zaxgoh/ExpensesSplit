import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Rules tests need a Node environment (they talk to the Firestore emulator over
 * gRPC, not to a DOM) and a separate include glob from the jsdom component
 * suite, so they get their own config rather than a `projects` entry that would
 * try to share one.
 *
 * Requires the emulator: `npm run emulators` in another terminal.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // One rules context per test, and they all share a single emulator project.
    fileParallelism: false,
  },
});
