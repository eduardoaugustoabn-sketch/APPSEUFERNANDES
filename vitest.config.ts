import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // The "@/*" alias comes from tsconfig.json's paths, which only Next.js's
  // own bundler resolves automatically — Vitest needs it declared here too,
  // or any test importing "@/..." fails with "Cannot find package".
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // src/lib/periodo.ts builds dates with `new Date(y, m, d).toISOString()`,
    // which is timezone-dependent (local midnight shifts across the UTC
    // boundary at positive offsets). Pin TZ so the date-math tests are
    // deterministic regardless of the host machine's timezone.
    env: {
      TZ: 'UTC',
    },
  },
})
