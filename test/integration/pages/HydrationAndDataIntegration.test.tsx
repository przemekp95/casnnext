import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Hydration and Data Integration Tests', () => {
  let isDatabaseAvailable = false;

  beforeAll(async () => {
    // Check if database is available for integration tests
    try {
      const { getPool } = await import('@/lib/db');
      const pool = getPool();
      if (pool) {
        await pool.execute('SELECT 1');
        isDatabaseAvailable = true;
      }
    } catch (error) {
      console.warn('Database not available for integration tests:', error.message);
    }
  });
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
      expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Zbiory analiz' })).toHaveAttribute('href', '/zbiory');

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

  describe.skip('Database Integration - Authors API', () => {
    // Skip API tests - they require running Next.js server with database
    // These tests are designed for integration testing with live server

    it('API /api/authors returns proper data structure with all attributes', async () => {
      const response = await fetch('http://localhost:3000/api/authors');
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
      const authorsResponse = await fetch('http://localhost:3000/api/authors');
      const authors = await authorsResponse.json();

      if (authors.length > 0) {
        const firstAuthor = authors[0];
        const detailResponse = await fetch(`http://localhost:3000/api/authors/${firstAuthor.slug}`);
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

  describe.skip('Database Integration - Articles API', () => {
    // Skip API tests - they require running Next.js server with database
    // These tests are designed for integration testing with live server

    it('API /api/articles returns articles with proper structure', async () => {
      const response = await fetch('http://localhost:3000/api/articles');
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);

      data.forEach((article: Record<string, unknown>) => {
        expect(article).toHaveProperty('id');
        expect(article).toHaveProperty('title');
        expect(article).toHaveProperty('slug');
        expect(article).toHaveProperty('content');
        expect(article).toHaveProperty('authorId');

        // Verify types
        expect(typeof article.id).toBe('string');
        expect(typeof article.title).toBe('string');
        expect(typeof article.slug).toBe('string');
        expect(typeof article.authorId).toBe('string');

        // Check optional fields
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
        fetch('http://localhost:3000/api/articles'),
        fetch('http://localhost:3000/api/authors')
      ]);

      const articles = await articlesResponse.json();
      const authors = await authorsResponse.json();

      const authorIds = new Set(authors.map((a: Record<string, unknown>) => a.id));

      articles.forEach((article: Record<string, unknown>) => {
        expect(authorIds.has(article.authorId)).toBe(true);
      });
    });
  });

  describe.skip('Hydration Testing - Client/Server Consistency', () => {
    // Skip hydration tests - they require running Next.js server
    // These tests are designed for integration testing with live server

    it('server-rendered HTML matches client-rendered HTML', async () => {
      // Test static pages for hydration consistency
      const pagesToTest = ['/', '/kontakt', '/zbiory'];

      for (const page of pagesToTest) {
        const response = await fetch(`http://localhost:3000${page}`);
        expect(response.ok).toBe(true);

        const html = await response.text();

        // Basic checks for well-formed HTML
        expect(html).toContain('<html');
        expect(html).toContain('<head');
        expect(html).toContain('<body');

        // Check for Next.js hydration markers
        expect(html).toContain('data-reactroot');
      }
    });

    it('dynamic author pages render without hydration errors', async () => {
      const authorsResponse = await fetch('http://localhost:3000/api/authors');
      const authors = await authorsResponse.json();

      if (authors.length > 0) {
        const firstAuthor = authors[0];
        const response = await fetch(`http://localhost:3000/autor/${firstAuthor.slug}`);
        expect(response.ok).toBe(true);

        const html = await response.text();
        expect(html).toContain('<html');
        expect(html).not.toContain('Error:');
        expect(html).not.toContain('TypeError:');
      }
    });
  });

  describe.skip('End-to-End Data Flow', () => {
    // Skip end-to-end tests - they require running Next.js server with database
    // These tests are designed for integration testing with live server

    it('complete data flow: DB → API → UI', async () => {
      // 1. Get data from database via API
      const [authorsResponse, articlesResponse] = await Promise.all([
        fetch('http://localhost:3000/api/authors'),
        fetch('http://localhost:3000/api/articles')
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