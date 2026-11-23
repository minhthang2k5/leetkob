import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests import other @leetkob packages from their TypeScript source (the "source"
  // export condition). The process integration suite builds dist itself for its child.
  resolve: { conditions: ['source'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['tests/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 120000
  }
});
