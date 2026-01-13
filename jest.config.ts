import nextJest from 'next/jest.js';
const createJestConfig = nextJest({ dir: './' });

const config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': '<rootDir>/test/__mocks__/styleMock.js',
    '\\.(png|jpg|jpeg|gif|svg|webp|avif)$': '<rootDir>/test/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/$1'
  },
  testMatch: ['**/?(*.)+(test|spec).[jt]s?(x)'],
  transformIgnorePatterns: ['/node_modules/(?!(nanoid)/)'],
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/deploy/'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/deploy/'],
  // Force exit to prevent hanging due to database connections
  forceExit: true,
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
      branches: 15,
      functions: 25,
      lines: 25,
      statements: 25
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