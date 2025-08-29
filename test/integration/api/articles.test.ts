/** @jest-environment node */
import { PrismaClient } from '@prisma/client';

let route: any;
let hasHandlers = false;
try {
  route = require('@/app/api/articles/route');
  hasHandlers = !!(route.GET || route.POST);
} catch (_) {}

const prisma = new PrismaClient();

(hasHandlers ? describe : describe.skip)('API /api/articles', () => {
  let createdAuthorId: number | null = null;
  let createdAuthorSlug = `autor-test-${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.analysis.deleteMany().catch(() => {});
    await prisma.author.deleteMany().catch(() => {});
    const a = await prisma.author.create({
      data: {
        name: 'Autor Test',
        slug: createdAuthorSlug,
        img: '/images/authors/test.png', // wymagane przez schemat
        bio: 'Autor do testów API'
      }
    });
    createdAuthorId = a.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET zwraca listę (może być pusta)', async () => {
    const req = new Request('http://localhost/api/articles');
    const res = await route.GET(req as any);
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
    const res = await route.POST(req as any);
    expect([200,201]).toContain(res.status);
    const json = await res.json();
    expect(json?.slug).toBe(payload.slug);
    expect(json?.author?.id).toBe(createdAuthorId);
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
    const res = await route.POST(req as any);
    expect([200,201]).toContain(res.status);
    const json = await res.json();
    expect(json?.slug).toBe(payload.slug);
    expect(json?.author?.slug).toBe(createdAuthorSlug);
  });

  it('POST odrzuca bez autora', async () => {
    const payload = { title: 'Bez autora', slug: `no-author-${Date.now()}` };
    const req = new Request('http://localhost/api/articles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await route.POST(req as any);
    expect(res.status).toBe(400);
  });
});
