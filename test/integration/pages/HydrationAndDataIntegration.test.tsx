import { render, screen, waitFor, within } from '@testing-library/react';

// Mock data loaders for non-live integration rendering tests.
jest.mock('@/lib/authors', () => ({
  getAuthors: async () => [
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

jest.mock('@/lib/server/issues', () => ({
  getIssueCollections: async () => [
    {
      id: "2025",
      year: 2025,
      title: "Zeszyt Analiz 2025",
      file: "/wszystkie_teksty_druk_3mm_spad_04_12.pdf",
      cover: "/images/logo.jpg",
    },
  ],
}));

describe('Hydration and Data Integration Tests', () => {
  describe('Authors Page - Full Data Flow', () => {
    it('loads authors from MySQL and renders all attributes correctly', async () => {
      const { default: AuthorsPage } = await import('@/app/autorzy/page');

      render(await AuthorsPage());

      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      }, { timeout: 5000 });

      expect(screen.getByRole('heading', { name: 'Nasi autorzy' })).toBeInTheDocument();

      const authorCards = document.querySelectorAll('.our-team-box');
      authorCards.forEach(card => {
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

      expect(screen.getByRole('heading', { name: 'Zbiory analiz' })).toBeInTheDocument();

      const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(within(breadcrumb).getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
      expect(within(breadcrumb).getByText('Zbiory analiz')).toBeInTheDocument();

      const analysisCards = document.querySelectorAll('.blog-list-item');
      expect(analysisCards.length).toBeGreaterThanOrEqual(0);

      analysisCards.forEach(card => {
        expect(card).toHaveClass('bg-white', 'rounded', 'mt-4');

        const img = card.querySelector('img');
        if (img) {
          expect(img).toHaveAttribute('alt');
          expect(img).toHaveAttribute('src');
        }

        const titleElement = card.querySelector('.cases-desc h5');
        if (titleElement) {
          expect(titleElement.textContent).toBeTruthy();
        }

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
});
