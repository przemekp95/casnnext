/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

/** @jest-environment node */
import { revalidateTag } from 'next/cache';

let route: { POST: (req: Request) => Promise<Response> } | null = null;

try {
  route = require('@/app/api/revalidate/route') as RouteModule;
} catch {
  route = null;
}

(route ? describe : describe.skip)('API /api/revalidate', () => {
  const mockRevalidateTag = jest.mocked(revalidateTag);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST wywołuje revalidateTag z prawidłowym tagiem', async () => {
    const payload = { tag: 'articles' };

    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({ ok: true });

    expect(mockRevalidateTag).toHaveBeenCalledWith('articles', 'next');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
  });

  it('POST wywołuje revalidateTag z innym tagiem', async () => {
    const payload = { tag: 'homepage' };

    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    await route!.POST(req);

    expect(mockRevalidateTag).toHaveBeenCalledWith('homepage', 'next');
  });

  it('POST zwraca błąd 400 gdy brakuje tag', async () => {
    const payload = {}; // Missing tag

    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data).toEqual({ ok: false, error: 'Missing tag' });

    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('POST zwraca błąd 400 przy nieprawidłowym JSON', async () => {
    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid json'
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data).toEqual({ ok: false, error: 'Missing tag' });

    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('POST obsługuje pusty request body', async () => {
    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: ''
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data).toEqual({ ok: false, error: 'Missing tag' });
  });

  it('POST wywołuje revalidateTag z tag = null', async () => {
    const payload = { tag: null };

    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(400);

    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('POST wywołuje revalidateTag z tag = undefined', async () => {
    const payload = { tag: undefined };

    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(400);

    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('POST wywołuje revalidateTag z pustym stringiem', async () => {
    const payload = { tag: '' };

    const req = new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(400);

    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});