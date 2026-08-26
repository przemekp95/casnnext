/** @jest-environment node */

jest.mock('@/lib/db.server', () => {
  throw new Error('liveness must not import the database boundary');
});

describe('API /api/health/live', () => {
  it('returns the DB-free liveness contract', async () => {
    const { GET } = await import('@/app/api/health/live/route');

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'alive' });
  });
});
