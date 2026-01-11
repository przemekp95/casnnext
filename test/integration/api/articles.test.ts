/** @jest-environment node */
import { query } from '@/lib/db';

interface RouteModule {
  GET: () => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
}

let route: RouteModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  route = require('@/app/api/articles/route') as RouteModule;
} catch (_unused) {
  route = null;
}

const createdAuthorSlug = `autor-test-${Date.now()}`;

(route ? describe : describe.skip)('API /api/articles', () => {
  let createdAuthorId: number | null = null;

  beforeAll(async () => {
    // Clean up
    await query('DELETE FROM Analysis WHERE 1=1').catch(() => {});
    await query('DELETE FROM Author WHERE 1=1').catch(() => {});

    // Create test author
    await query(
      'INSERT INTO Author (name, slug, img, bio) VALUES (?, ?, ?, ?)',
      ['Autor Test', createdAuthorSlug, '/images/authors/test.png', 'Autor do testów API']
    );
    const result = await query<{ id: number }>('SELECT LAST_INSERT_ID() AS id');
    if (result.length > 0) {
      createdAuthorId = result[0].id;
    }
  });

  it('GET zwraca listę (może być pusta)', async () => {
    const res = await route!.GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('POST tworzy rekord z authorId', async () => {
    const payload = {
      title: 'Test API',
      slug: `test-api-${Date.now()}`,
      authorId: createdAuthorId
    };
    const req = new Request('http://localhost/api/articles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await route!.POST(req);
    expect([200,201]).toContain(res.status);
    const json = await res.json();
    expect(json?.slug).toBe(payload.slug);
    expect(json?.authorId).toBe(createdAuthorId);
  });

  it('POST tworzy rekord z authorSlug', async () => {
    const payload = {
      title: 'Test API 2',
      slug: `test-api2-${Date.now()}`,
      authorSlug: createdAuthorSlug
    };
    const req = new Request('http://localhost/api/articles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await route!.POST(req);
    expect([200,201]).toContain(res.status);
    const json = await res.json();
    expect(json?.slug).toBe(payload.slug);
    expect(json?.author_slug).toBe(createdAuthorSlug);
  });

  it('POST odrzuca bez autora', async () => {
    const payload = { title: 'Bez autora', slug: `no-author-${Date.now()}` };
    const req = new Request('http://localhost/api/articles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await route!.POST(req);
    expect(res.status).toBe(400);
  });
});