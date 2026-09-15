import { defineConfig } from "vitest/config";
import path from "node:path";

const inlineDeps = ["@x402/next", "@x402/core", "@x402/evm"];

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node", server: { deps: { inline: inlineDeps } } },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
