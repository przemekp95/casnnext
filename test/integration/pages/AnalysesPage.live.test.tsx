import { render, screen, waitFor, within } from '@testing-library/react';
import AnalysesPage from '@/app/analizy/page';

describe('Analyses Page', () => {
  it('renders standard page shell when NEXT_PHASE indicates production build', async () => {
    const previousPhase = process.env.NEXT_PHASE;
    process.env.NEXT_PHASE = 'phase-production-build';

    try {
      render(await AnalysesPage());

      expect(screen.getByRole('heading', { level: 1, name: 'Analizy' })).toBeInTheDocument();
      expect(screen.queryByText('Ładowanie analiz...')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /Wszystkie analizy \(0\)/ })).toBeInTheDocument();
      expect(screen.getByText('Brak dostępnych analiz. Sprawdź ponownie później.')).toBeInTheDocument();
    } finally {
      if (previousPhase === undefined) {
        delete process.env.NEXT_PHASE;
      } else {
        process.env.NEXT_PHASE = previousPhase;
      }
    }
  });

  it('renders hero section and breadcrumb links', async () => {
    delete process.env.NEXT_PHASE;

    render(await AnalysesPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Analizy' })).toBeInTheDocument();

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByRole('link', { name: 'Analizy' })).toHaveAttribute('href', '/analizy');
  });

  it('renders analyses list summary and either cards or empty state', async () => {
    delete process.env.NEXT_PHASE;

    const { container } = render(await AnalysesPage());

    const summaryHeading = screen.getByRole('heading', {
      level: 2,
      name: /Wszystkie analizy \(\d+\)/,
    });
    const countMatch = summaryHeading.textContent?.match(/\((\d+)\)/);
    const total = Number(countMatch?.[1] ?? '0');

    if (total === 0) {
      expect(screen.getByText('Brak dostępnych analiz. Sprawdź ponownie później.')).toBeInTheDocument();
    } else {
      await waitFor(() => {
        expect(container.querySelector('.projects-wrapper')).toBeInTheDocument();
        expect(container.querySelector('.blog-list-item')).toBeInTheDocument();
      });

      const cards = Array.from(container.querySelectorAll('.blog-list-item'));
      expect(cards.length).toBeGreaterThan(0);

      cards.forEach((card) => {
        const titleLink = card.querySelector('.cases-desc a[href^="/analizy/"]');
        const authorLink = card.querySelector('.cases-desc a[href^="/autor/"]');
        const readLink = card.querySelector('.learn-more a[href^="/analizy/"]');

        expect(titleLink).toBeTruthy();
        expect(authorLink).toBeTruthy();
        expect(readLink).toBeTruthy();
      });
    }
  });

  it('renders PRZECZYTAJ links to analysis detail pages', async () => {
    delete process.env.NEXT_PHASE;

    render(await AnalysesPage());

    const links = screen.queryAllByRole('link', { name: /przeczytaj/i });

    if (links.length === 0) {
      expect(screen.getByText('Brak dostępnych analiz. Sprawdź ponownie później.')).toBeInTheDocument();
    } else {
      expect(links[0]).toHaveAttribute('href', expect.stringMatching(/^\/analizy\//));
    }
  });
});
