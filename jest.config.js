const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // next/jest does not reliably pick the `@/*` alias out of tsconfig for
  // `jest.mock()` calls, which resolve before the transform runs. Declared
  // here so component tests can mock by the same specifier the source imports.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/e2e/',
    '<rootDir>/supabase/', // DB-backed tests: run separately via `npm run test:db` (needs `supabase start`)
  ],
};

module.exports = createJestConfig(config);
