import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/parity/**/*.test.ts", "tests/api/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
