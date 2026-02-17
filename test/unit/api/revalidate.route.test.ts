/** @jest-environment node */

describe('POST /api/revalidate', () => {
  const previousSecret = process.env.REVALIDATE_SECRET;

  beforeEach(() => {
    process.env.REVALIDATE_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.REVALIDATE_SECRET = previousSecret;
  });

  it('rejects request when secret is invalid', async () => {
    const { POST } = await import('@/app/api/revalidate/route');
    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': 'wrong' },
      body: JSON.stringify({ tag: 'analyses' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('accepts request with valid secret and inferred tags', async () => {
    const { POST } = await import('@/app/api/revalidate/route');
    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': 'test-secret' },
      body: JSON.stringify({ model: 'analysis', event: 'entry.publish' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.tags).toEqual(expect.arrayContaining(['analyses', 'articles']));
  });

  it('rejects request when server secret is missing', async () => {
    delete process.env.REVALIDATE_SECRET;
    delete process.env.STRAPI_WEBHOOK_SECRET;

    const { POST } = await import('@/app/api/revalidate/route');
    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag: 'analyses' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
