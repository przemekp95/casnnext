import nextJest from 'next/jest.js';
const createJestConfig = nextJest({ dir: './' });
const runLiveTests = process.env.RUN_LIVE_TESTS === '1';

const config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': '<rootDir>/test/__mocks__/styleMock.js',
    '\\.(png|jpg|jpeg|gif|svg|webp|avif)$': '<rootDir>/test/__mocks__/fileMock.js',
    '^next/image$': '<rootDir>/test/__mocks__/nextImageMock.tsx',
    '^@/(.*)$': '<rootDir>/$1'
  },
  moduleFileExtensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
  testMatch: ['**/?(*.)+(test|spec).[jt]s?(x)'],
  transformIgnorePatterns: ['/node_modules/(?!(nanoid)/)'],
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/deploy/'],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/deploy/',
    ...(runLiveTests ? [] : ['\\.live\\.test\\.[jt]sx?$']),
  ],
  // Coverage configuration
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!app/**/layout.tsx',
    '!app/**/loading.tsx',
    '!app/**/error.tsx',
    '!app/**/not-found.tsx',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/test/**',
    '!**/scripts/**',
    '!**/docs/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text' as const, 'lcov' as const, 'json-summary' as const],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 65,
      statements: 65
    }
  },
  // Set test environment
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  }
};
export default createJestConfig(config);
