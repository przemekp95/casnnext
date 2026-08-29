import { jest } from '@jest/globals';

jest.mock('@/lib/db.shared', () => ({
  AppDataSource: {
    isInitialized: true,
    destroy: jest.fn().mockRejectedValue(
      new Error('canonical datasource destroy failed'),
    ),
  },
}));

test('runs a suite with an initialized canonical datasource', () => {
  expect(true).toBe(true);
});
