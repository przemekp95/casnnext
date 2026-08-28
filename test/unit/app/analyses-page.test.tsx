import { render, screen } from '@testing-library/react';
import type { AnalysisRow } from '@/types/analysis';
import AnalysesPage from '@/app/analizy/page';
import { getAnalyses } from '@/lib/analyses';

jest.mock('@/lib/analyses', () => ({
  getAnalyses: jest.fn(),
}));

const mockedGetAnalyses = getAnalyses as jest.MockedFunction<typeof getAnalyses>;

const analysis: AnalysisRow = {
  id: 'analysis-1',
  title: 'Analiza testowa',
  slug: 'analiza-testowa',
  authorId: 'author-1',
  author: {
    id: 'author-1',
    slug: 'jan-kowalski',
    name: 'Jan Kowalski',
    img: '/images/jan-kowalski.png',
  },
};

function createAnalysis(overrides: Partial<AnalysisRow>): AnalysisRow {
  return {
    id: 'analysis-default',
    title: 'Analiza domyślna',
    slug: 'analiza-domyslna',
    authorId: 'author-default',
    ...overrides,
  };
}

describe('app/analizy/page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders analysis detail links when loading succeeds', async () => {
    mockedGetAnalyses.mockResolvedValueOnce([analysis]);

    render(await AnalysesPage());

    expect(screen.getAllByRole('link', { name: 'Analiza testowa' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'PRZECZYTAJ' })).toHaveAttribute('href', '/analizy/analiza-testowa');
  });

  it('orders analyses by newest publication date then Polish title', async () => {
    mockedGetAnalyses.mockResolvedValueOnce([
      createAnalysis({
        id: 'zaba',
        title: 'Żaba',
        slug: 'zaba',
        publishedAt: '2025-01-02T00:00:00.000Z',
      }),
      createAnalysis({
        id: 'najnowsza',
        title: 'Najnowsza analiza',
        slug: 'najnowsza-analiza',
        publishedAt: '2025-01-03T00:00:00.000Z',
      }),
      createAnalysis({
        id: 'ala',
        title: 'Ala',
        slug: 'ala',
        publishedAt: '2025-01-02T00:00:00.000Z',
      }),
    ]);

    const { container } = render(await AnalysesPage());
    const titles = Array.from(container.querySelectorAll('ul li a')).map((link) => link.textContent);

    expect(titles).toEqual(['Najnowsza analiza', 'Ala', 'Żaba']);
  });

  it('renders the known author link and image metadata', async () => {
    mockedGetAnalyses.mockResolvedValueOnce([analysis]);

    render(await AnalysesPage());

    const authorLinks = screen.getAllByRole('link', { name: 'Jan Kowalski' });
    expect(authorLinks).toHaveLength(2);
    authorLinks.forEach((authorLink) => {
      expect(authorLink).toHaveAttribute('href', '/autor/jan-kowalski');
    });
    expect(screen.getByRole('img', { name: 'Jan Kowalski' })).toHaveAttribute('src', '/images/jan-kowalski.png');
  });

  it('renders unknown-author and placeholder-image fallbacks', async () => {
    mockedGetAnalyses.mockResolvedValueOnce([
      createAnalysis({
        id: 'bez-autora',
        title: 'Bez autora',
        slug: 'bez-autora',
        author: undefined,
      }),
    ]);

    render(await AnalysesPage());

    expect(screen.getByText('Nieznany autor')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Autor' })).toHaveAttribute('src', '/images/placeholder.png');
  });

  it('renders the empty state when no analyses are available', async () => {
    mockedGetAnalyses.mockResolvedValueOnce([]);

    render(await AnalysesPage());

    expect(screen.getByRole('heading', { level: 2, name: 'Wszystkie analizy (0)' })).toBeInTheDocument();
    expect(screen.getByText('Brak dostępnych analiz. Sprawdź ponownie później.')).toBeInTheDocument();
  });

  it('renders the explicit load error when loading fails', async () => {
    const failure = new Error('database unavailable');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedGetAnalyses.mockRejectedValueOnce(failure);

    try {
      render(await AnalysesPage());

      expect(screen.getByText('Wystąpił błąd podczas ładowania analiz.')).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalledWith('Analyses page error:', failure);
    } finally {
      consoleError.mockRestore();
    }
  });
});
