import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages (@leetkob/checker...) are imported from source in tests.
  resolve: { conditions: ['source'] },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    // Every file resets the one shared test database, so files must not run at the same time.
    fileParallelism: false,
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['tests/setup-env.ts']
  }
});
