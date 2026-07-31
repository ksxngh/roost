import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    // Integration tests share one PostgreSQL database and truncate tables
    // between cases, so test files must not run concurrently. The suite is
    // small enough that sequential execution costs little.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**",
        "src/generated/**",
        "src/test/**",
        "src/worker/**",
      ],
    },
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.integration.test.ts"],
        },
      },
    ],
  },
});
