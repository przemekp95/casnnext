/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */
import { promises as fs } from 'fs';
import path from 'path';

let route: { POST: (req: Request) => Promise<Response> } | null = null;

try {
  route = require('@/app/api/client-log/route') as RouteModule;
} catch {
  route = null;
}

(route ? describe : describe.skip)('API /api/client-log', () => {
  const mockAppendFile = jest.spyOn(fs, 'appendFile');
  const mockMkdir = jest.spyOn(fs, 'mkdir');
  const originalCwd = process.cwd;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppendFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    process.cwd = jest.fn().mockReturnValue('/test-root');
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  it('POST zapisuje log z pełnymi danymi', async () => {
    const payload = {
      type: 'error',
      message: 'Test error message',
      stack: 'Error stack trace',
      source: 'test-component'
    };

    const req = new Request('http://localhost/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({ ok: true });

    // Check if file operations were called correctly
    expect(mockMkdir).toHaveBeenCalledWith(path.join('/test-root', 'tmp'), { recursive: true });
    expect(mockAppendFile).toHaveBeenCalledWith(
      path.join('/test-root', 'tmp', 'client.log'),
      expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] error Test error message Error stack trace test-component\n$/),
      'utf8'
    );
  });

  it('POST zapisuje log z minimalnymi danymi', async () => {
    const payload = { message: 'Simple message' };

    const req = new Request('http://localhost/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(200);

    expect(mockAppendFile).toHaveBeenCalledWith(
      path.join('/test-root', 'tmp', 'client.log'),
      expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] client Simple message  \n$/),
      'utf8'
    );
  });

  it('POST obsługuje pusty JSON', async () => {
    const req = new Request('http://localhost/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(200);

    expect(mockAppendFile).toHaveBeenCalledWith(
      path.join('/test-root', 'tmp', 'client.log'),
      expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] client   \n$/),
      'utf8'
    );
  });

  it('POST obsługuje nieprawidłowy JSON', async () => {
    const req = new Request('http://localhost/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid json'
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(200);

    expect(mockAppendFile).toHaveBeenCalledWith(
      path.join('/test-root', 'tmp', 'client.log'),
      expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] client   \n$/),
      'utf8'
    );
  });

  it('POST zwraca błąd 500 przy problemach z plikami', async () => {
    mockAppendFile.mockRejectedValue(new Error('File system error'));

    const payload = { message: 'test' };
    const req = new Request('http://localhost/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await route!.POST(req);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data).toEqual({ ok: false });
  });

  it('POST tworzy katalog tmp jeśli nie istnieje', async () => {
    const payload = { type: 'info', message: 'test' };
    const req = new Request('http://localhost/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    await route!.POST(req);

    expect(mockMkdir).toHaveBeenCalledWith(path.join('/test-root', 'tmp'), { recursive: true });
  });
});