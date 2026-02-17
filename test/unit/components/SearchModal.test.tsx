/** @jest-environment jsdom */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SearchModal from '@/components/SearchModal';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock performance.now
const mockPerformanceNow = jest.fn();
Object.defineProperty(window, 'performance', {
  writable: true,
  value: { now: mockPerformanceNow }
});

describe('SearchModal', () => {
  const mockProps = {
    isOpen: true,
    onClose: jest.fn()
  };

  const mockSearchIndex = [
    {
      slug: 'test-article-1',
      title: 'Test Article One',
      author: 'Test Author',
      date: '2024-01-15',
      excerpt: 'This is a test excerpt for the first article',
      content: 'This is the full content of the first test article'
    },
    {
      slug: 'test-article-2',
      title: 'Another Test Article',
      author: 'Another Author',
      date: '2024-01-10',
      excerpt: 'This is a test excerpt for the second article',
      content: 'This is the full content of the second test article'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSearchIndex)
    });
    mockPerformanceNow.mockReturnValue(1000);
  });

  afterEach(() => {
    mockPerformanceNow.mockReturnValue(1000);
  });

  it('renders search modal when isOpen is true', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Szukaj w analizach...')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Szukaj w analizach...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zamknij wyszukiwanie' })).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<SearchModal {...mockProps} isOpen={false} />);

    expect(screen.queryByPlaceholderText('Szukaj w analizach...')).not.toBeInTheDocument();
  });

  it('loads search index on open', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/search-index');
    });
  });

  it('displays loading state initially', async () => {
    render(<SearchModal {...mockProps} />);

    expect(screen.getByText('Ładowanie indeksu wyszukiwania...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Ładowanie indeksu wyszukiwania...')).not.toBeInTheDocument();
    });
  });

  it('displays empty state when no query', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Zacznij pisać, aby wyszukać w treściach analiz...')).toBeInTheDocument();
    });
  });

  it('filters results based on search query', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'first' } });

    await waitFor(() => {
      expect(screen.getByText('Test Article One')).toBeInTheDocument();
      expect(screen.queryByText('Another Test Article')).not.toBeInTheDocument();
    });
  });

  it('displays search filters when query is entered', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Szukaj w:')).toBeInTheDocument();
      expect(screen.getByText('Wszystko')).toBeInTheDocument();
      expect(screen.getByText('Tytuły')).toBeInTheDocument();
      expect(screen.getByText('Autorzy')).toBeInTheDocument();
      expect(screen.getByText('Treść')).toBeInTheDocument();
    });
  });

  it('filters by title when title filter is selected', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'Test' } });

    await waitFor(() => {
      const titleFilterButton = screen.getByText('Tytuły');
      fireEvent.click(titleFilterButton);
    });

    await waitFor(() => {
      // Check if both articles are still shown (both contain "Test" in title)
      const links = screen.getAllByRole('link');
      expect(links.length).toBe(2);
      expect(links.some(link => link.getAttribute('href')?.includes('test-article-1'))).toBe(true);
      expect(links.some(link => link.getAttribute('href')?.includes('test-article-2'))).toBe(true);
    });
  });

  it('filters by author when author filter is selected', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'Test' } });

    await waitFor(() => {
      // Check if results are displayed by looking for the results count
      expect(screen.getByText((content) => content.includes('wyników'))).toBeInTheDocument();
    });

    // Ensure both articles are shown initially
    const allLinks = screen.getAllByRole('link');
    expect(allLinks.length).toBe(2);

    const authorFilterButton = screen.getByText('Autorzy');
    fireEvent.click(authorFilterButton);

    // Wait for filter to apply - should show only articles with "Test" in author field
    await waitFor(() => {
      const filteredLinks = screen.getAllByRole('link');
      expect(filteredLinks.length).toBe(1);
      expect(filteredLinks[0].getAttribute('href')).toBe('/analizy/test-article-1');
    }, { timeout: 3000 });
  });

  it('filters to show no results when filtering by author field that contains no matches', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'NoAuthorMatch' } });

    const authorFilterButton = screen.getByText('Autorzy');
    fireEvent.click(authorFilterButton);

    await waitFor(() => {
      expect(screen.getByText(/Nie znaleziono wyników dla/)).toBeInTheDocument();
    });

    expect(screen.queryByText('Test Article One')).not.toBeInTheDocument();
    expect(screen.queryByText('Another Test Article')).not.toBeInTheDocument();
  });

  it('sorts by relevance when relevance sort is selected', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'article' } });

    await waitFor(() => {
      const relevanceSortButton = screen.getByText('Trafność');
      fireEvent.click(relevanceSortButton);
    });

    await waitFor(() => {
      // Results should be sorted by relevance (fuzzy match score)
      const results = screen.getAllByRole('link');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  it('displays search performance metrics', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Setup performance mock before search
    mockPerformanceNow
      .mockReturnValueOnce(1000) // start time
      .mockReturnValueOnce(1012.5); // end time (12.5ms later)

    const input = screen.getByPlaceholderText('Szukaj w analizach...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
    });

    await waitFor(() => {
      // Check if performance metrics are displayed
      expect(screen.getByText((content) => content.includes('wyników'))).toBeInTheDocument();
      // Performance metrics might be in a separate element
      const metricsElement = screen.getByText(/\(\d+\.\d+ms\)/);
      expect(metricsElement).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('displays no results message when no matches found', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'nonexistentquery' } });

    await waitFor(() => {
      expect(screen.getByText('Nie znaleziono wyników dla "nonexistentquery"')).toBeInTheDocument();
    });
  });

  it('closes modal when close button is clicked', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      const closeButton = screen.getByRole('button', { name: 'Zamknij wyszukiwanie' });
      fireEvent.click(closeButton);
    });

    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('closes modal when overlay is clicked', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      const overlay = document.querySelector('.search-overlay');
      if (overlay) {
        fireEvent.click(overlay);
      }
    });

    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('closes modal when Escape key is pressed', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('API Error'));

    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Ładowanie indeksu wyszukiwania...')).toBeInTheDocument();
    });

    // Should still show empty state after error
    await waitFor(() => {
      expect(screen.getByText('Zacznij pisać, aby wyszukać w treściach analiz...')).toBeInTheDocument();
    });
  });

  it('renders result links correctly', async () => {
    render(<SearchModal {...mockProps} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Szukaj w analizach...');
    fireEvent.change(input, { target: { value: 'Test' } });

    await waitFor(() => {
      // Check if links with correct hrefs exist
      const links = screen.getAllByRole('link');
      expect(links.length).toBe(2);
      expect(links.some(link => link.getAttribute('href') === '/analizy/test-article-1')).toBe(true);
      expect(links.some(link => link.getAttribute('href') === '/analizy/test-article-2')).toBe(true);
    });
  });
});
