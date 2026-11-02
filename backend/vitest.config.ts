import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Integration files share seeded PostgreSQL patients; isolate their mutations from other suites.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
