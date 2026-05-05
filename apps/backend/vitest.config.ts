import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/db/seed.ts",
        "src/**/*.d.ts",
      ],
    },
    // Each test file gets its own isolated environment
    isolate: true,
    // Timeout for async operations (OpenAI mocks etc.)
    testTimeout: 10000,
  },
});
