import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import AuthorPage, { generateMetadata } from '@/app/autor/[slug]/page';
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

jest.mock('next/script', () => ({
  __esModule: true,
  default: ({
    id,
    type,
    dangerouslySetInnerHTML,
  }: {
    id?: string;
    type?: string;
    dangerouslySetInnerHTML?: { __html?: string };
  }) => (
    <script
      data-testid={id ?? 'script'}
      type={type}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    />
  ),
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

  it('renderuje structured data z poprawnym absolutnym URL zdjęcia autora ze Strapi', async () => {
    mockedGetAuthorBySlug.mockResolvedValueOnce({
      author: {
        id: '15',
        slug: 'autor-strapi',
        name: 'Autor Strapi',
        displayName: 'Autor Strapi',
        bio: 'Biogram autora ze Strapi',
        img: 'https://cms.example.com/cms/uploads/autor-strapi.png',
      },
      analyses: [{ id: '51', slug: 'nowy-mdx', title: 'Nowy MDX' }],
    });

    const page = await AuthorPage({ params: Promise.resolve({ slug: 'autor-strapi' }) });
    render(page);

    expect(screen.getByAltText('Zdjęcie Autor Strapi')).toHaveAttribute(
      'src',
      'https://cms.example.com/cms/uploads/autor-strapi.png',
    );

    const authorStructuredData = JSON.parse(
      screen.getByTestId('author-structured-data').innerHTML,
    ) as { image?: string; knowsAbout?: string[] };
    const breadcrumbStructuredData = JSON.parse(
      screen.getByTestId('breadcrumb-structured-data').innerHTML,
    ) as { itemListElement?: Array<{ item?: string }> };

    expect(authorStructuredData.image).toBe('https://cms.example.com/cms/uploads/autor-strapi.png');
    expect(authorStructuredData.knowsAbout).toContain('Nowy MDX');
    expect(breadcrumbStructuredData.itemListElement?.[2]?.item).toBe('https://casn.pl/autor/autor-strapi');
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

  it('generuje SEO metadata dla nowego autora ze zdjęciem ze Strapi', async () => {
    mockedGetAuthorBySlug.mockResolvedValueOnce({
      author: {
        id: '21',
        slug: 'nowy-autor',
        name: 'Nowy Autor',
        displayName: 'Nowy Autor',
        bio: 'Nowy biogram',
        img: 'https://cms.example.com/cms/uploads/nowy-autor.png',
      },
      analyses: [{ id: '70', slug: 'nowy-mdx', title: 'Nowy MDX' }],
    });

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'nowy-autor' }) });

    const openGraph = result.openGraph as
      | {
          title?: string;
          description?: string;
          url?: string;
          images?: Array<{ url?: string; alt?: string }>;
        }
      | undefined;
    const twitter = result.twitter as { images?: string[] } | undefined;
    const alternates = result.alternates as { canonical?: string } | undefined;

    expect(result.title).toBe('Nowy Autor - Centrum Analiz Służby Niepodległej');
    expect(result.description).toBe('Nowy Autor - Nowy biogram');
    expect(openGraph?.url).toBe('https://casn.pl/autor/nowy-autor');
    expect(openGraph?.images?.[0]?.url).toBe('https://cms.example.com/cms/uploads/nowy-autor.png');
    expect(openGraph?.images?.[0]?.alt).toBe('Zdjęcie Nowy Autor');
    expect(twitter?.images).toEqual(['https://cms.example.com/cms/uploads/nowy-autor.png']);
    expect(alternates?.canonical).toBe('https://casn.pl/autor/nowy-autor');
  });
});
