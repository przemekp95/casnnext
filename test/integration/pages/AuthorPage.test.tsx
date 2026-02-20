import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { notFound } from 'next/navigation';
import AuthorPage from '@/app/autor/[slug]/page';
import { getAuthorBySlug } from '@/lib/authors';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));

jest.mock('@/lib/authors', () => ({
  getAuthorBySlug: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ unoptimized: _unoptimized, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

jest.mock('next/script', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/Hero', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="hero-title">{title}</div>,
}));

const mockedNotFound = notFound as jest.MockedFunction<typeof notFound>;
const mockedGetAuthorBySlug = getAuthorBySlug as jest.MockedFunction<typeof getAuthorBySlug>;

describe('Author Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wywołuje notFound gdy brakuje slug', async () => {
    await AuthorPage({ params: Promise.resolve({}) });
    expect(mockedNotFound).toHaveBeenCalled();
  });

  it('wywołuje notFound gdy autor nie istnieje', async () => {
    mockedGetAuthorBySlug.mockResolvedValueOnce(null);

    await AuthorPage({ params: Promise.resolve({ slug: 'non-existent-author' }) });

    expect(mockedGetAuthorBySlug).toHaveBeenCalledWith('non-existent-author');
    expect(mockedNotFound).toHaveBeenCalled();
  });

  it('renderuje dane autora i listę analiz', async () => {
    mockedGetAuthorBySlug.mockResolvedValueOnce({
      author: {
        id: '1',
        slug: 'jan-kowalski',
        name: 'Jan Kowalski',
        displayName: 'Jan Kowalski',
        bio: 'Ekspert w dziedzinie analiz politycznych',
        img: '/images/author.jpg',
      },
      analyses: [{ id: '11', slug: 'analiza-1', title: 'Analiza 1' }],
    });

    const page = await AuthorPage({ params: Promise.resolve({ slug: 'jan-kowalski' }) });
    render(page);

    expect(screen.getByTestId('hero-title')).toHaveTextContent('Jan Kowalski');
    expect(screen.getByRole('heading', { name: 'Jan Kowalski' })).toBeInTheDocument();
    expect(screen.getByText('Ekspert w dziedzinie analiz politycznych')).toBeInTheDocument();
    expect(screen.getByText('Artykuły')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analiza 1' })).toHaveAttribute('href', '/analizy/analiza-1');
  });

  it('używa placeholdera gdy autor nie ma zdjęcia', async () => {
    mockedGetAuthorBySlug.mockResolvedValueOnce({
      author: {
        id: '1',
        slug: 'anna-nowak',
        name: 'Anna Nowak',
        displayName: 'Anna Nowak',
        bio: null,
        img: null,
      },
      analyses: [],
    });

    const page = await AuthorPage({ params: Promise.resolve({ slug: 'anna-nowak' }) });
    render(page);

    expect(screen.getByAltText('Zdjęcie Anna Nowak')).toHaveAttribute('src', '/images/placeholder.png');
    expect(screen.queryByText('Artykuły')).not.toBeInTheDocument();
  });
});
