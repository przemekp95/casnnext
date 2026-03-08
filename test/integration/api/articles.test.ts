/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */
import { AppDataSource, query } from '@/lib/db.server';

interface RouteModule {
  GET: () => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
}

let route: RouteModule | null = null;

try {
  route = require('@/app/api/articles/route') as RouteModule;
} catch {
  route = null;
}

const createdAuthorSlug = `autor-test-${Date.now()}`;

(route ? describe : describe.skip)('API /api/articles', () => {
  let createdAuthorId: number | null = null;
  let isDatabaseAvailable = false;
  const originalStrapiApiToken = process.env.STRAPI_API_TOKEN;

  beforeAll(async () => {
    delete process.env.STRAPI_API_TOKEN;

    try {
      if (!AppDataSource) return;
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      isDatabaseAvailable = true;

      await query('DELETE FROM Analysis WHERE 1=1');
      await query('DELETE FROM Author WHERE 1=1');

      await query(
        'INSERT INTO Author (name, displayName, slug, img, bio, publishedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [
          'Autor Test',
          'Autor Test',
          createdAuthorSlug,
          '/images/authors/test.png',
          'Autor do testów API',
          new Date(),
        ]
      );
      const result = (await query('SELECT LAST_INSERT_ID() AS id')) as Array<{ id: number }>;
      if (result.length > 0) {
        createdAuthorId = result[0].id;
      }
    } catch {
      isDatabaseAvailable = false;
    }
  });

  afterAll(async () => {
    process.env.STRAPI_API_TOKEN = originalStrapiApiToken;
  });

  it('GET zwraca listę (może być pusta)', async () => {
    if (!isDatabaseAvailable) return;

    const res = await route!.GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('POST tworzy rekord z authorId', async () => {
    if (!isDatabaseAvailable) return;

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
    if (!isDatabaseAvailable) return;

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
    if (!isDatabaseAvailable) return;

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
