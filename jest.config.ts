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
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/deploy/']
};
export default createJestConfig(config);
