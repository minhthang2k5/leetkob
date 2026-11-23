import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests import other @leetkob packages from their TypeScript source (the "source"
  // export condition), so no build is needed before `npm test`.
  resolve: { conditions: ['source'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts']
  }
});
