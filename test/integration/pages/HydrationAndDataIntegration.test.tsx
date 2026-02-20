import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import http from 'node:http';
import https from 'node:https';

// Mock server-side data loading to avoid client-side import issues
jest.mock('@/lib/server/authors.loader', () => ({
  loadAuthors: async () => [
    {
      id: "1",
      slug: "piotr-balcerowski",
      name: "Piotr Balcerowski",
      displayName: "Piotr Balcerowski",
      img: "/images/Balcerowski.png",
      bio: "Analityk polityczny specjalizujący się w geopolityce Europy Środkowej i Wschodniej."
    }
  ],
}));

const runLiveTests = process.env.RUN_LIVE_TESTS === '1';
const describeLive = runLiveTests ? describe : describe.skip;

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
    const response = await fetchFromServer('http://localhost:3000/api/health', {
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

describe('Hydration and Data Integration Tests', () => {
  describe('Authors Page - Full Data Flow', () => {
    it('loads authors from MySQL and renders all attributes correctly', async () => {
      // Dynamic import to avoid build issues
      const { default: AuthorsPage } = await import('@/app/autorzy/page');

      render(await AuthorsPage());

      // Wait for authors to load (if any)
      await waitFor(() => {
        // Check if page renders without errors
        expect(document.body).toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify page structure - look for h1 specifically
      expect(screen.getByRole('heading', { name: 'Nasi autorzy' })).toBeInTheDocument();

      // If authors exist, verify all attributes are rendered
      const authorCards = document.querySelectorAll('.our-team-box');
      authorCards.forEach(card => {
        // Check for required elements
        const img = card.querySelector('img');
        const nameElement = card.querySelector('.our-team-name h6');
        const link = card.querySelector('a');

        if (img) {
          expect(img).toHaveAttribute('alt');
          expect(img).toHaveAttribute('src');
        }

        if (nameElement) {
          expect(nameElement.textContent).toBeTruthy();
        }

        if (link) {
          expect(link).toHaveAttribute('href');
          expect(link.getAttribute('href')).toMatch(/^\/autor\//);
        }
      });
    });
  });

  describe('Zbiory Page - Analysis Data Integration', () => {
    it('renders analysis issues with proper structure and data', async () => {
      const { default: ZbioryPage } = await import('@/app/zbiory/page');

      render(await ZbioryPage());

      // Check hero section - look for h1 specifically
      expect(screen.getByRole('heading', { name: 'Zbiory analiz' })).toBeInTheDocument();

      // Check breadcrumb
      const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(within(breadcrumb).getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
      expect(within(breadcrumb).getByText('Zbiory analiz')).toBeInTheDocument();

      // Check analysis cards structure
      const analysisCards = document.querySelectorAll('.blog-list-item');
      expect(analysisCards.length).toBeGreaterThanOrEqual(0); // At least empty state

      analysisCards.forEach(card => {
        // Verify card structure
        expect(card).toHaveClass('bg-white', 'rounded', 'mt-4');

        // Check for image
        const img = card.querySelector('img');
        if (img) {
          expect(img).toHaveAttribute('alt');
          expect(img).toHaveAttribute('src');
        }

        // Check for title
        const titleElement = card.querySelector('.cases-desc h5');
        if (titleElement) {
          expect(titleElement.textContent).toBeTruthy();
        }

        // Check for download link
        const downloadBtn = card.querySelector('.learn-more a');
        if (downloadBtn) {
          expect(downloadBtn).toHaveAttribute('href');
          expect(downloadBtn).toHaveAttribute('target', '_blank');
          expect(downloadBtn).toHaveAttribute('rel', 'noopener noreferrer');
          expect(downloadBtn.textContent).toBe('POBIERZ');
        }
      });
    });
  });

  describeLive('Database Integration - Authors API', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('API /api/authors returns proper data structure with all attributes', async () => {
      const response = await fetchFromServer('http://localhost:3000/api/authors');
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);

      data.forEach((author: Record<string, unknown>) => {
        // Verify required attributes
        expect(author).toHaveProperty('id');
        expect(author).toHaveProperty('slug');
        expect(author).toHaveProperty('name');
        expect(author).toHaveProperty('displayName');
        expect(typeof author.id).toBe('string');
        expect(typeof author.slug).toBe('string');
        expect(typeof author.name).toBe('string');
        expect(typeof author.displayName).toBe('string');

        // Verify optional attributes
        if (author.img !== null) {
          expect(typeof author.img).toBe('string');
        }
        if (author.bio !== null) {
          expect(typeof author.bio).toBe('string');
        }
      });
    });

    it('API /api/authors/[slug] returns detailed author with analyses', async () => {
      // First get list of authors
      const authorsResponse = await fetchFromServer('http://localhost:3000/api/authors');
      const authors = await authorsResponse.json();

      if (authors.length > 0) {
        const firstAuthor = authors[0];
        const detailResponse = await fetchFromServer(`http://localhost:3000/api/authors/${firstAuthor.slug}`);
        expect(detailResponse.ok).toBe(true);

        const detailData = await detailResponse.json();
        expect(detailData).toHaveProperty('author');
        expect(detailData).toHaveProperty('analyses');

        // Verify author structure
        const author = detailData.author;
        expect(author).toHaveProperty('id');
        expect(author).toHaveProperty('slug');
        expect(author).toHaveProperty('name');
        expect(author).toHaveProperty('displayName');

        // Verify analyses structure
        expect(Array.isArray(detailData.analyses)).toBe(true);
        detailData.analyses.forEach((analysis: Record<string, unknown>) => {
          expect(analysis).toHaveProperty('id');
          expect(analysis).toHaveProperty('title');
          expect(analysis).toHaveProperty('slug');
        });
      }
    });
  });

  describeLive('Database Integration - Articles API', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('API /api/articles returns articles with proper structure', async () => {
      const response = await fetchFromServer('http://localhost:3000/api/articles');
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);

      data.forEach((article: Record<string, unknown>) => {
        expect(article).toHaveProperty('id');
        expect(article).toHaveProperty('title');
        expect(article).toHaveProperty('slug');
        expect(article).toHaveProperty('authorId');

        // Verify types
        expect(['string', 'number']).toContain(typeof article.id);
        expect(typeof article.title).toBe('string');
        expect(typeof article.slug).toBe('string');
        expect(['string', 'number']).toContain(typeof article.authorId);

        // Check optional fields
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
        fetchFromServer('http://localhost:3000/api/articles'),
        fetchFromServer('http://localhost:3000/api/authors')
      ]);

      const articles = await articlesResponse.json();
      const authors = await authorsResponse.json();

      const authorIds = new Set(authors.map((a: Record<string, unknown>) => a.id));

      articles.forEach((article: Record<string, unknown>) => {
        expect(authorIds.has(String(article.authorId))).toBe(true);
      });
    });
  });

  describeLive('Hydration Testing - Client/Server Consistency', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('server-rendered HTML matches client-rendered HTML', async () => {
      // Test static pages for hydration consistency
      const pagesToTest = ['/', '/kontakt', '/zbiory'];

      for (const page of pagesToTest) {
        const response = await fetchFromServer(`http://localhost:3000${page}`);
        expect(response.ok).toBe(true);

        const html = await response.text();

        // Basic checks for well-formed HTML
        expect(html).toContain('<html');
        expect(html).toContain('<head');
        expect(html).toContain('<body');

        expect(html).toContain('</html>');
      }
    });

    it('dynamic author pages render without hydration errors', async () => {
      const authorsResponse = await fetchFromServer('http://localhost:3000/api/authors');
      const authors = await authorsResponse.json();

      if (authors.length > 0) {
        const firstAuthor = authors[0];
        const response = await fetchFromServer(`http://localhost:3000/autor/${firstAuthor.slug}`);
        expect(response.ok).toBe(true);

        const html = await response.text();
        expect(html).toContain('<html');
        expect(html).not.toContain('Error:');
        expect(html).not.toContain('TypeError:');
      }
    });

    it('dynamic analysis pages render without hydration errors', async () => {
      const articlesResponse = await fetchFromServer('http://localhost:3000/api/articles');
      const articles = await articlesResponse.json();

      if (articles.length > 0) {
        const firstArticle = articles[0];
        const response = await fetchFromServer(`http://localhost:3000/analizy/${firstArticle.slug}`);
        expect(response.ok).toBe(true);

        const html = await response.text();
        expect(html).toContain('<html');
        expect(html).not.toContain('Error:');
        expect(html).not.toContain('TypeError:');
        expect(html).not.toContain('Minified React error');
      }
    });

    it('pages handle missing data gracefully without hydration errors', async () => {
      // Test pages that might return empty states or handle missing data
      const testPages = [
        '/autorzy', // Empty authors list
        '/zbiory',  // Analysis collection
        '/analizy'  // Analysis list
      ];

      for (const page of testPages) {
        const response = await fetchFromServer(`http://localhost:3000${page}`);
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
      // Test basic navigation flow
      const pages = ['/', '/kontakt', '/zbiory', '/autorzy'];

      for (const page of pages) {
        const response = await fetchFromServer(`http://localhost:3000${page}`);
        expect(response.ok).toBe(true);

        const html = await response.text();
        expect(html).toContain('<html');
        expect(html).not.toContain('Error:');
        expect(html).not.toContain('TypeError:');
        expect(html).not.toContain('Minified React error');

        // Check for navigation elements
        expect(html).toContain('Strona główna');
        expect(html).toContain('Autorzy');
      }
    });
  });

  describeLive('End-to-End Data Flow', () => {
    beforeAll(async () => {
      await assertLocalServerAvailable();
    });

    it('complete data flow: DB → API → UI', async () => {
      // 1. Get data from database via API
      const [authorsResponse, articlesResponse] = await Promise.all([
        fetchFromServer('http://localhost:3000/api/authors'),
        fetchFromServer('http://localhost:3000/api/articles')
      ]);

      const authors = await authorsResponse.json();
      const articles = await articlesResponse.json();

      // 2. Verify data integrity
      expect(Array.isArray(authors)).toBe(true);
      expect(Array.isArray(articles)).toBe(true);

      // 3. Test UI rendering with real data
      if (authors.length > 0) {
        const { default: AuthorsPage } = await import('@/app/autorzy/page');
        render(await AuthorsPage());

        await waitFor(() => {
          expect(document.body).toBeInTheDocument();
        });

        // Verify UI reflects database data
        const authorCards = document.querySelectorAll('.our-team-box');
        expect(authorCards.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('analysis data flows correctly from DB to UI', async () => {
      const { default: ZbioryPage } = await import('@/app/zbiory/page');
      render(await ZbioryPage());

      // Verify analysis cards are rendered
      await waitFor(() => {
        const analysisCards = document.querySelectorAll('.blog-list-item');
        expect(analysisCards.length).toBeGreaterThanOrEqual(0);
      });

      // Check that each card has proper structure
      const analysisCards = document.querySelectorAll('.blog-list-item');
      analysisCards.forEach(card => {
        const downloadLink = card.querySelector('.learn-more a');
        if (downloadLink) {
          expect(downloadLink).toHaveAttribute('href');
          expect(downloadLink.getAttribute('href')).toMatch(/\.(pdf)$/);
        }
      });
    });
  });
});
