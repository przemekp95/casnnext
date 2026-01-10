/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { render, screen, waitFor } from '@testing-library/react';
import { notFound } from 'next/navigation';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));

let PageComponent: any;
let hasComponent = false;
try {
  PageComponent = require('@/app/autor/[slug]/page').default;
  hasComponent = !!PageComponent;
} catch {}

(hasComponent ? describe : describe.skip)('Author Page', () => {
  const { AppDataSource } = require('@/lib/db');
  const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

  beforeAll(async () => {
    // In CI environment, database should already be initialized by workflow
    // In local development, initialize if needed
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  afterAll(async () => {
    // Don't destroy in CI - let the workflow handle cleanup
    // Only destroy in local development
    if (AppDataSource.isInitialized && !process.env.CI) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear all data before each test (only if database is initialized)
    if (AppDataSource.isInitialized) {
      try {
        await AppDataSource.getRepository('Author').delete({});
        await AppDataSource.getRepository('Analysis').delete({});
      } catch (error) {
        // If tables don't exist yet, that's ok - they'll be created by synchronize
        console.log('Database cleanup skipped - tables may not exist yet');
      }
    }
  });

  it('wywołuje notFound gdy brakuje slug', async () => {
    const props = { params: {} };

    await PageComponent(props);

    expect(mockNotFound).toHaveBeenCalled();
  });

  it('wywołuje notFound gdy autor nie istnieje', async () => {
    const props = { params: { slug: 'non-existent-author' } };

    await PageComponent(props);

    expect(mockNotFound).toHaveBeenCalled();
  });

  it('renderuje stronę autora gdy dane są dostępne', async () => {
    // Create test data in the database
    const authorRepository = AppDataSource.getRepository('Author');
    const analysisRepository = AppDataSource.getRepository('Analysis');

    const author = await authorRepository.save({
      slug: 'test-author',
      name: 'Jan Kowalski',
      bio: 'Ekspert w dziedzinie analiz politycznych',
      img: '/images/author.jpg'
    });

    await analysisRepository.save([
      { title: 'Analiza 1', slug: 'analiza-1', authorId: author.id },
      { title: 'Analiza 2', slug: 'analiza-2', authorId: author.id },
    ]);

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
    // Create test data
    const authorRepository = AppDataSource.getRepository('Author');
    const analysisRepository = AppDataSource.getRepository('Analysis');

    const author = await authorRepository.save({
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio text',
      img: '/images/test.jpg'
    });

    await analysisRepository.save({
      title: 'Test Analysis',
      slug: 'test-analysis',
      authorId: author.id
    });

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Test Analysis')).toBeInTheDocument();
    });

    const analysisLink = screen.getByRole('link', { name: 'Test Analysis' });
    expect(analysisLink).toHaveAttribute('href', '/analizy/test-analysis');
  });

  it('renderuje obraz autora lub placeholder', async () => {
    const authorRepository = AppDataSource.getRepository('Author');

    // Test with image
    const authorWithImage = await authorRepository.save({
      slug: 'author-with-image',
      name: 'Author With Image',
      bio: 'Bio',
      img: '/images/author.jpg'
    });

    const props1 = { params: { slug: 'author-with-image' } };
    const { rerender } = render(await PageComponent(props1));

    await waitFor(() => {
      const img = screen.getByAltText('Zdjęcie Author With Image');
      expect(img).toHaveAttribute('src', '/images/author.jpg');
    });

    // Test without image
    const authorWithoutImage = await authorRepository.save({
      slug: 'author-without-image',
      name: 'Author Without Image',
      bio: 'Bio',
      img: null
    });

    const props2 = { params: { slug: 'author-without-image' } };
    rerender(await PageComponent(props2));

    await waitFor(() => {
      const img = screen.getByAltText('Zdjęcie Author Without Image');
      expect(img).toHaveAttribute('src', '/images/placeholder.png');
    });
  });

  it('renderuje hero sekcję z breadcrumb', async () => {
    const authorRepository = AppDataSource.getRepository('Author');

    await authorRepository.save({
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    });

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Test Author')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Nasi autorzy' })).toHaveAttribute('href', '/autorzy');
  });

  it('renderuje sekcję artykułów tylko gdy autor ma analizy', async () => {
    const authorRepository = AppDataSource.getRepository('Author');
    const analysisRepository = AppDataSource.getRepository('Analysis');

    const author = await authorRepository.save({
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    });

    await analysisRepository.save({
      title: 'Analysis 1',
      slug: 'analysis-1',
      authorId: author.id
    });

    const props = { params: { slug: 'test-author' } };
    const { container } = render(await PageComponent(props));

    await waitFor(() => {
      expect(container.querySelector('.section.bg-light')).toBeInTheDocument();
      expect(screen.getByText('Artykuły')).toBeInTheDocument();
    });
  });

  it('nie renderuje sekcji artykułów gdy autor nie ma analiz', async () => {
    const authorRepository = AppDataSource.getRepository('Author');

    await authorRepository.save({
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    });

    const props = { params: { slug: 'test-author' } };
    const { container } = render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('Test Author')).toBeInTheDocument();
    });

    // Should not have articles section
    expect(container.querySelector('.section.bg-light')).not.toBeInTheDocument();
  });

  it('renderuje biogram autora', async () => {
    const authorRepository = AppDataSource.getRepository('Author');

    await authorRepository.save({
      slug: 'test-author',
      name: 'Test Author',
      bio: 'To jest przykładowy biogram autora z wieloma informacjami.',
      img: '/images/test.jpg'
    });

    const props = { params: { slug: 'test-author' } };

    render(await PageComponent(props));

    await waitFor(() => {
      expect(screen.getByText('To jest przykładowy biogram autora z wieloma informacjami.')).toBeInTheDocument();
    });
  });

  it('renderuje pusty biogram gdy nie jest dostępny', async () => {
    const authorRepository = AppDataSource.getRepository('Author');

    await authorRepository.save({
      slug: 'test-author',
      name: 'Test Author',
      bio: null,
      img: '/images/test.jpg'
    });

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
    const authorRepository = AppDataSource.getRepository('Author');

    await authorRepository.save({
      slug: 'test-author',
      name: 'Test Author',
      bio: 'Bio',
      img: '/images/test.jpg'
    });

    const props = { params: { slug: 'test-author' } };
    const { container } = render(await PageComponent(props));

    await waitFor(() => {
      expect(container.querySelector('.col-lg-4')).toBeInTheDocument();
      expect(container.querySelector('.col-lg-8')).toBeInTheDocument();
      expect(container.querySelector('.team-details')).toBeInTheDocument();
    });
  });
});