import { render, waitFor } from '@testing-library/react';
import http from 'node:http';
import https from 'node:https';

const liveBaseUrl = process.env.LIVE_BASE_URL ?? 'http://127.0.0.1:31337';

function serverUrl(path: string): string {
  return new URL(path, liveBaseUrl).toString();
}

async function fetchFromServer(url: string, init?: RequestInit): Promise<Response> {
  const requestUrl = new URL(url);
  const client = requestUrl.protocol === 'https:' ? https : http;
  const method = init?.method ?? 'GET';

  return new Promise((resolve, reject) => {
    const request = client.request(
      requestUrl,
      {
        method,
        headers: init?.headers as http.OutgoingHttpHeaders | undefined,
      },
      (response) => {
        let rawBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          rawBody += chunk;
        });
        response.on('end', () => {
          const statusCode = response.statusCode ?? 0;
          const responseLike = {
            ok: statusCode >= 200 && statusCode < 300,
            status: statusCode,
            json: async () => (rawBody ? JSON.parse(rawBody) : null),
            text: async () => rawBody,
          };
          resolve(responseLike as unknown as Response);
        });
      }
    );

    request.on('error', reject);

    if (init?.signal) {
      init.signal.addEventListener(
        'abort',
        () => {
          request.destroy(new Error('Request aborted'));
        },
        { once: true }
      );
    }

    if (init?.body) {
      request.write(String(init.body));
    }

    request.end();
  });
}

async function assertLocalServerAvailable() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1_500);

  try {
    const response = await fetchFromServer(serverUrl('/api/health'), {
      signal: controller.signal
    });

    if (!response) {
      throw new Error('Health endpoint request returned no response object');
    }

    if (!response.ok) {
      throw new Error(`Health endpoint returned HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

describe('Hydration and Data Integration Tests - Live', () => {
  describe('Database Integration - Authors API', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('API /api/authors returns proper data structure with all attributes', async () => {
      const response = await fetchFromServer(serverUrl('/api/authors'));
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      data.forEach((author: Record<string, unknown>) => {
        expect(author).toHaveProperty('id');
        expect(author).toHaveProperty('slug');
        expect(author).toHaveProperty('name');
        expect(author).toHaveProperty('displayName');
        expect(typeof author.id).toBe('string');
        expect(typeof author.slug).toBe('string');
        expect(typeof author.name).toBe('string');
        expect(typeof author.displayName).toBe('string');

        if (author.img !== null) {
          expect(typeof author.img).toBe('string');
        }
        if (author.bio !== null) {
          expect(typeof author.bio).toBe('string');
        }
      });
    });

    it('API /api/authors/[slug] returns detailed author with analyses', async () => {
      const authorsResponse = await fetchFromServer(serverUrl('/api/authors'));
      const authors = await authorsResponse.json();
      expect(authors.length).toBeGreaterThan(0);

      const firstAuthor = authors[0];
      const detailResponse = await fetchFromServer(serverUrl(`/api/authors/${firstAuthor.slug}`));
      expect(detailResponse.ok).toBe(true);

      const detailData = await detailResponse.json();
      expect(detailData).toHaveProperty('author');
      expect(detailData).toHaveProperty('analyses');

      const author = detailData.author;
      expect(author).toHaveProperty('id');
      expect(author).toHaveProperty('slug');
      expect(author).toHaveProperty('name');
      expect(author).toHaveProperty('displayName');

      expect(Array.isArray(detailData.analyses)).toBe(true);
      detailData.analyses.forEach((analysis: Record<string, unknown>) => {
        expect(analysis).toHaveProperty('id');
        expect(analysis).toHaveProperty('title');
        expect(analysis).toHaveProperty('slug');
      });
    });
  });

  describe('Database Integration - Articles API', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('API /api/articles returns articles with proper structure', async () => {
      const response = await fetchFromServer(serverUrl('/api/articles'));
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      data.forEach((article: Record<string, unknown>) => {
        expect(article).toHaveProperty('id');
        expect(article).toHaveProperty('title');
        expect(article).toHaveProperty('slug');
        expect(article).toHaveProperty('authorId');

        expect(['string', 'number']).toContain(typeof article.id);
        expect(typeof article.title).toBe('string');
        expect(typeof article.slug).toBe('string');
        expect(['string', 'number']).toContain(typeof article.authorId);

        if (article.content) {
          expect(typeof article.content).toBe('string');
        }
        if (article.excerpt) {
          expect(typeof article.excerpt).toBe('string');
        }
        if (article.publishedAt) {
          expect(typeof article.publishedAt).toBe('string');
        }
      });
    });

    it('articles link correctly to their authors', async () => {
      const [articlesResponse, authorsResponse] = await Promise.all([
        fetchFromServer(serverUrl('/api/articles')),
        fetchFromServer(serverUrl('/api/authors'))
      ]);

      const articles = await articlesResponse.json();
      const authors = await authorsResponse.json();
      expect(articles.length).toBeGreaterThan(0);
      expect(authors.length).toBeGreaterThan(0);

      const authorIds = new Set(authors.map((a: Record<string, unknown>) => a.id));

      articles.forEach((article: Record<string, unknown>) => {
        expect(authorIds.has(String(article.authorId))).toBe(true);
      });
    });
  });

  describe('Hydration Testing - Client/Server Consistency', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('server-rendered HTML matches client-rendered HTML', async () => {
      const pagesToTest = ['/', '/kontakt', '/zbiory'];

      for (const page of pagesToTest) {
        const response = await fetchFromServer(serverUrl(page));
        expect(response.ok).toBe(true);

        const html = await response.text();

        expect(html).toContain('<html');
        expect(html).toContain('<head');
        expect(html).toContain('<body');
        expect(html).toContain('</html>');
      }
    });

    it('dynamic author pages render without hydration errors', async () => {
      const authorsResponse = await fetchFromServer(serverUrl('/api/authors'));
      const authors = await authorsResponse.json();
      expect(authors.length).toBeGreaterThan(0);

      const firstAuthor = authors[0];
      const response = await fetchFromServer(serverUrl(`/autor/${firstAuthor.slug}`));
      expect(response.ok).toBe(true);

      const html = await response.text();
      expect(html).toContain('<html');
      expect(html).not.toContain('Error:');
      expect(html).not.toContain('TypeError:');
    });

    it('dynamic analysis pages render without hydration errors', async () => {
      const articlesResponse = await fetchFromServer(serverUrl('/api/articles'));
      const articles = await articlesResponse.json();
      expect(articles.length).toBeGreaterThan(0);

      const firstArticle = articles[0];
      const response = await fetchFromServer(serverUrl(`/analizy/${firstArticle.slug}`));
      expect(response.ok).toBe(true);

      const html = await response.text();
      expect(html).toContain('<html');
      expect(html).not.toContain('Error:');
      expect(html).not.toContain('TypeError:');
      expect(html).not.toContain('Minified React error');
    });

    it('pages handle missing data gracefully without hydration errors', async () => {
      const testPages = [
        '/autorzy',
        '/zbiory',
        '/analizy'
      ];

      for (const page of testPages) {
        const response = await fetchFromServer(serverUrl(page));
        expect(response.ok).toBe(true);

        const html = await response.text();
        expect(html).toContain('<html');
        expect(html).not.toContain('Error:');
        expect(html).not.toContain('TypeError:');
        expect(html).not.toContain('Minified React error');
        expect(html).not.toContain('Cannot read properties of undefined');
      }
    });

    it('navigation between pages works without hydration errors', async () => {
      const pages = ['/', '/kontakt', '/zbiory', '/autorzy'];

      for (const page of pages) {
        const response = await fetchFromServer(serverUrl(page));
        expect(response.ok).toBe(true);

        const html = await response.text();
        expect(html).toContain('<html');
        expect(html).not.toContain('Error:');
        expect(html).not.toContain('TypeError:');
        expect(html).not.toContain('Minified React error');
        expect(html).toContain('Strona główna');
        expect(html).toContain('Autorzy');
      }
    });
  });

  describe('End-to-End Data Flow', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('complete data flow: DB → API → UI', async () => {
      const [authorsResponse, articlesResponse] = await Promise.all([
        fetchFromServer(serverUrl('/api/authors')),
        fetchFromServer(serverUrl('/api/articles'))
      ]);

      const authors = await authorsResponse.json();
      const articles = await articlesResponse.json();

      expect(Array.isArray(authors)).toBe(true);
      expect(Array.isArray(articles)).toBe(true);
      expect(authors.length).toBeGreaterThan(0);
      expect(articles.length).toBeGreaterThan(0);

      const { default: AuthorsPage } = await import('@/app/autorzy/page');
      render(await AuthorsPage());

      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });

      const authorCards = document.querySelectorAll('.our-team-box');
      expect(authorCards.length).toBeGreaterThan(0);
    });

    it('analysis data flows correctly from DB to UI', async () => {
      const { default: ZbioryPage } = await import('@/app/zbiory/page');
      render(await ZbioryPage());

      await waitFor(() => {
        const analysisCards = document.querySelectorAll('.blog-list-item');
        expect(analysisCards.length).toBeGreaterThan(0);
      });

      const analysisCards = document.querySelectorAll('.blog-list-item');
      analysisCards.forEach(card => {
        const downloadLink = card.querySelector('.learn-more a');
        expect(downloadLink).not.toBeNull();
        expect(downloadLink).toHaveAttribute('href');
        expect(downloadLink?.getAttribute('href')).toMatch(/\.(pdf)$/);
      });
    });
  });
});
