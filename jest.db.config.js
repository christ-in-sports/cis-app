const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/**
 * Separate from jest.config.js on purpose: these tests need a live local
 * Postgres (`supabase start`), unlike the jsdom unit tests `npm run test`
 * runs. Keeping them in their own config means the main lint/type-check/
 * test/build CI job -- which has no database -- never tries to run them.
 * See .github/workflows/ci.yml's `db-tests` job for how they're invoked.
 */
/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/supabase/tests/**/*.test.ts'],
  // competition-actions.test.ts imports the real Server Actions, which import
  // by the `@/` alias, and mocks two of their dependencies by the same
  // specifier (see the note in jest.config.js).
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

module.exports = createJestConfig(config);
