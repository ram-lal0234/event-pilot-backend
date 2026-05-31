import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      VITEST: 'true'
    },
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules', 'src/lambda', 'src/tests']
    }
  }
});
