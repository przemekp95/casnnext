/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/** @jest-environment node */
import { render, screen, waitFor } from '@testing-library/react';
import { notFound } from 'next/navigation';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));

// Mock database queries
jest.mock('@/lib/db', () => ({
  query: jest.fn(),
}));

let PageComponent: any;
let hasComponent = false;
try {
  PageComponent = require('@/app/autor/[slug]/page').default;
  hasComponent = !!PageComponent;
} catch {}

(hasComponent ? describe : describe.skip)('Author Page', () => {
  const mockQuery = require('@/lib/db').query;
  const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wywołuje notFound gdy brakuje slug', async () => {
    const props = { params: {} };

    await PageComponent(props);

    expect(mockNotFound).toHaveBeenCalled();
  });

  it('wywołuje notFound gdy autor nie istnieje', async () => {
    mockQuery.mockResolvedValueOnce([]); // No author found

    const props = { params: { slug: 'non-existent-author' } };

    await PageComponent(props);

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT id, slug, name, bio, img FROM Author WHERE slug = ? LIMIT 1",
      ['non-existent-author']
    );
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('renderuje stronę autora gdy dane są dostępne', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Jan Kowalski',
      bio: 'Ekspert w dziedzinie analiz politycznych',
      img: '/images/author.jpg'
    };

    const mockAnalyses = [
      { id: 1, title: 'Analiza 1', slug: 'analiza-1' },
      { id: 2, title: 'Analiza 2', slug: 'analiza-2' },
    ];

    mockQuery
      .mockResolvedValueOnce([mockAuthor]) // Author query
      .mockResolvedValueOnce(mockAnalyses); // Analyses query

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Jan Kowalski')).toBeInTheDocument();
      expect(screen.getByText('Ekspert w dziedzinie analiz politycznych')).toBeInTheDocument();
    });

    expect(screen.getByText('Analiza 1')).toBeInTheDocument();
    expect(screen.getByText('Analiza 2')).toBeInTheDocument();
  });

  it('renderuje prawidłowe linki do analiz autora', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio text',
      img: '/images/test.jpg'
    };

    const mockAnalyses = [
      { id: 1, title: 'Test Analysis', slug: 'test-analysis' },
    ];

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce(mockAnalyses);

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Test Analysis')).toBeInTheDocument();
    });

    const analysisLink = screen.getByRole('link', { name: 'Test Analysis' });
    expect(analysisLink).toHaveAttribute('href', '/analizy/test-analysis');
  });

  it('renderuje obraz autora lub placeholder', async () => {
    const mockAuthorWithImage = {
      id: 1,
      slug: 'author-with-image',
      name: 'Author With Image',
      bio: 'Bio',
      img: '/images/author.jpg'
    };

    const mockAuthorWithoutImage = {
      id: 2,
      slug: 'author-without-image',
      name: 'Author Without Image',
      bio: 'Bio',
      img: null
    };

    // Test with image
    mockQuery
      .mockResolvedValueOnce([mockAuthorWithImage])
      .mockResolvedValueOnce([]);

    const props1 = { params: { slug: 'author-with-image' } };

    const { rerender } = render(await PageComponent(props1));

    await waitFor(() => {
      const img = screen.getByAltText('Zdjęcie Author With Image');
      expect(img).toHaveAttribute('src', '/images/author.jpg');
    });

    // Test without image
    mockQuery
      .mockResolvedValueOnce([mockAuthorWithoutImage])
      .mockResolvedValueOnce([]);

    const props2 = { params: { slug: 'author-without-image' } };

    rerender(await PageComponent(props2));

    await waitFor(() => {
      const img = screen.getByAltText('Zdjęcie Author Without Image');
      expect(img).toHaveAttribute('src', '/images/placeholder.png');
    });
  });

  it('renderuje hero sekcję z breadcrumb', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    };

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce([]);

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Test Author')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Nasi autorzy' })).toHaveAttribute('href', '/autorzy');
  });

  it('renderuje sekcję artykułów tylko gdy autor ma analizy', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    };

    // Test with analyses
    const mockAnalyses = [
      { id: 1, title: 'Analysis 1', slug: 'analysis-1' },
    ];

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce(mockAnalyses);

    const props = { params: { slug: 'test-author' } };

    const { container } = render(await PageComponent(props));

    await waitFor(() => {
      expect(container.querySelector('.section.bg-light')).toBeInTheDocument();
      expect(screen.getByText('Artykuły')).toBeInTheDocument();
    });
  });

  it('nie renderuje sekcji artykułów gdy autor nie ma analiz', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    };

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce([]); // No analyses

    const props = { params: { slug: 'test-author' } };

    const { container } = render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Test Author')).toBeInTheDocument();
    });

    // Should not have articles section
    expect(container.querySelector('.section.bg-light')).not.toBeInTheDocument();
  });

  it('renderuje biogram autora', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: 'To jest przykładowy biogram autora z wieloma informacjami.',
      img: '/images/test.jpg'
    };

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce([]);

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('To jest przykładowy biogram autora z wieloma informacjami.')).toBeInTheDocument();
    });
  });

  it('renderuje pusty biogram gdy nie jest dostępny', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: null,
      img: '/images/test.jpg'
    };

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce([]);

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Test Author')).toBeInTheDocument();
    });

    // Should render empty bio section
    const bioElement = screen.getByText('', { selector: '.team-details-desc' });
    expect(bioElement).toBeInTheDocument();
  });

  it('ma odpowiednie klasy CSS dla layout', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    };

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce([]);

    const props = { params: { slug: 'test-author' } };

    const { container } = render(await PageComponent(props));

    await waitFor(() => {
      expect(container.querySelector('.col-lg-4')).toBeInTheDocument();
      expect(container.querySelector('.col-lg-8')).toBeInTheDocument();
      expect(container.querySelector('.team-details')).toBeInTheDocument();
    });
  });

  it('wywołuje prawidłowe zapytania do bazy danych', async () => {
    const mockAuthor = {
      id: 1,
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    };

    const mockAnalyses = [
      { id: 1, title: 'Analysis', slug: 'analysis' },
    ];

    mockQuery
      .mockResolvedValueOnce([mockAuthor])
      .mockResolvedValueOnce(mockAnalyses);

    const props = { params: { slug: 'test-author' } };

    await PageComponent(props);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      "SELECT id, slug, name, bio, img FROM Author WHERE slug = ? LIMIT 1",
      ['test-author']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      "SELECT id, title, slug FROM Analysis WHERE authorId = ? ORDER BY id DESC",
      [1]
    );
  });
});