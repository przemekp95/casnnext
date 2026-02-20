import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AnalysisDetail, AnalysisRow } from '@/types/analysis';
import { getAnalyses, getAnalysisBySlug } from '@/lib/analyses';
import { notFound } from 'next/navigation';
import { isStrapiProvider } from '@/lib/content-provider';
import { normalizeCmsMdxMediaPaths } from '@/lib/cms/mdx-media';
import Page, { generateMetadata, generateStaticParams } from '@/app/analizy/[slug]/page';

jest.mock('@/lib/analyses', () => ({
  getAnalyses: jest.fn(),
  getAnalysisBySlug: jest.fn(),
}));

jest.mock('@/lib/content-provider', () => ({
  isStrapiProvider: jest.fn(),
}));

jest.mock('@/lib/cms/mdx-media', () => ({
  normalizeCmsMdxMediaPaths: jest.fn((value: string) => value.replace('/uploads/', '/cms/uploads/')),
}));

jest.mock('next/script', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ArticleLayout', () => ({
  __esModule: true,
  default: ({
    children,
    title,
    author,
    lead,
    date,
  }: {
    children: ReactNode;
    title?: string;
    author?: string;
    lead?: string;
    date?: string;
  }) => (
    <article
      data-testid="article-layout"
      data-title={title}
      data-author={author}
      data-lead={lead}
      data-date={date}
    >
      {children}
    </article>
  ),
}));

jest.mock('@/components/mdx/MDXContent', () => ({
  __esModule: true,
  default: ({ source }: { source: string }) => <div data-testid="mdx-source">{source}</div>,
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => 'NOT_FOUND'),
}));

const mockedGetAnalyses = getAnalyses as jest.MockedFunction<typeof getAnalyses>;
const mockedGetAnalysisBySlug = getAnalysisBySlug as jest.MockedFunction<typeof getAnalysisBySlug>;
const mockedNotFound = notFound as jest.MockedFunction<typeof notFound>;
const mockedIsStrapiProvider = isStrapiProvider as jest.MockedFunction<typeof isStrapiProvider>;
const mockedNormalizeCmsMdxMediaPaths =
  normalizeCmsMdxMediaPaths as jest.MockedFunction<typeof normalizeCmsMdxMediaPaths>;

const createAnalysisRow = (overrides: Partial<AnalysisRow>): AnalysisRow => ({
  id: '1',
  title: 'Analiza testowa',
  slug: 'analiza-testowa',
  authorId: '1',
  ...overrides,
});

const createAnalysisDetail = (overrides: Partial<AnalysisDetail>): AnalysisDetail => ({
  id: '1',
  title: 'Analiza testowa',
  slug: 'analiza-testowa',
  ...overrides,
});

describe('app/analizy/[slug]/page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsStrapiProvider.mockReturnValue(false);
  });

  it('generateStaticParams returns slugs from analyses', async () => {
    mockedGetAnalyses.mockResolvedValueOnce([
      createAnalysisRow({ id: '1', title: 'A-1', slug: 'a-1' }),
      createAnalysisRow({ id: '2', title: 'A-2', slug: 'a-2' }),
    ]);

    const result = await generateStaticParams();
    expect(result).toEqual([{ slug: 'a-1' }, { slug: 'a-2' }]);
  });

  it('generateStaticParams returns empty list on provider failure', async () => {
    mockedGetAnalyses.mockRejectedValueOnce(new Error('DB unavailable'));

    const result = await generateStaticParams();
    expect(result).toEqual([]);
  });

  it('generateMetadata returns not-found metadata when article is missing', async () => {
    mockedGetAnalysisBySlug.mockResolvedValueOnce(null);

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'missing' }) });

    expect(result).toEqual({
      title: 'Nie znaleziono artykułu - Centrum Analiz Służby Niepodległej',
      description: 'Artykuł nie został znaleziony.',
    });
  });

  it('generateMetadata builds article metadata from analysis', async () => {
    mockedGetAnalysisBySlug.mockResolvedValueOnce(
      createAnalysisDetail({
        slug: 'testowa-analiza',
        title: 'Testowa analiza',
        author: { name: 'Jan Kowalski', bio: 'Ekspert CASN' },
      }),
    );

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'testowa-analiza' }) });

    const openGraph = result.openGraph as { authors?: string[] } | undefined;
    const alternates = result.alternates as { canonical?: string } | undefined;

    expect(result.title).toBe('Testowa analiza - Centrum Analiz Służby Niepodległej');
    expect(result.description).toBe('Testowa analiza - Ekspert CASN');
    expect(openGraph?.authors).toEqual(['Jan Kowalski']);
    expect(alternates?.canonical).toBe('https://casn.pl/analizy/testowa-analiza');
  });

  it('generateMetadata falls back to site defaults on unexpected error', async () => {
    mockedGetAnalysisBySlug.mockRejectedValueOnce(new Error('Unexpected failure'));

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'boom' }) });

    expect(result).toEqual({
      title: 'Centrum Analiz Służby Niepodległej',
      description: 'Analizy polityki i społeczeństwa',
    });
  });

  it('Page calls notFound when slug is missing', async () => {
    const result = await Page({ params: Promise.resolve({ slug: '' }) });
    expect(mockedNotFound).toHaveBeenCalled();
    expect(result).toBe('NOT_FOUND');
  });

  it('Page calls notFound when analysis does not exist', async () => {
    mockedGetAnalysisBySlug.mockResolvedValueOnce(null);

    const result = await Page({ params: Promise.resolve({ slug: 'unknown' }) });

    expect(mockedNotFound).toHaveBeenCalled();
    expect(result).toBe('NOT_FOUND');
  });

  it('Page renders analysis and normalizes CMS media paths for strapi provider', async () => {
    mockedIsStrapiProvider.mockReturnValueOnce(true);
    mockedGetAnalysisBySlug.mockResolvedValueOnce(
      createAnalysisDetail({
        id: '42',
        slug: 'test',
        title: 'Baza tytułu',
        lead: 'Lead bazowy',
        description: 'Opis',
        date: '2025-01-02',
        category: 'geo',
        author: {
          name: 'Anna Autor',
          bio: 'Bio autorki',
        },
        contentMdx: `---
title: "Artykuł {{analysisTitle}}"
lead: "Lead {{authorName}}"
author: "{{authorName}}"
date: 2026-03-04
---
![Obraz](/uploads/cms.png)
`,
      }),
    );

    const jsx = await Page({ params: Promise.resolve({ slug: 'test' }) });
    render(jsx as ReactNode);

    expect(screen.getByTestId('article-layout')).toHaveAttribute('data-title', 'Artykuł Baza tytułu');
    expect(screen.getByTestId('article-layout')).toHaveAttribute('data-lead', 'Lead Anna Autor');
    expect(screen.getByTestId('article-layout')).toHaveAttribute('data-author', 'Anna Autor');
    expect(screen.getByTestId('article-layout').getAttribute('data-date')).toContain('2026');
    expect(screen.getByTestId('mdx-source')).toHaveTextContent('/cms/uploads/cms.png');
    expect(mockedNormalizeCmsMdxMediaPaths).toHaveBeenCalled();
  });
});
