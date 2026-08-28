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
