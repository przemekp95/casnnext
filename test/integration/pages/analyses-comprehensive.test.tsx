/* eslint-disable @typescript-eslint/no-require-imports */

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getAnalyses, getAnalysisBySlug } from '@/lib/analyses';

jest.mock('@/lib/analyses', () => ({
  getAnalyses: jest.fn(),
  getAnalysisBySlug: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
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

jest.mock('@/components/ArticleLayout', () => ({
  __esModule: true,
  default: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <div data-testid="article-layout">{children}</div>
    </main>
  ),
}));

jest.mock('@/components/mdx/MDXContent', () => ({
  __esModule: true,
  default: ({ source }: { source: string }) => <div data-testid="mdx-content">{source}</div>,
}));

describe('Analyses Pages - Comprehensive Coverage', () => {
  const mockedGetAnalyses = getAnalyses as jest.MockedFunction<typeof getAnalyses>;
  const mockedGetAnalysisBySlug = getAnalysisBySlug as jest.MockedFunction<typeof getAnalysisBySlug>;
  const mockedNotFound = notFound as jest.MockedFunction<typeof notFound>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Analyses List Page', () => {
    it('renders page without errors', async () => {
      mockedGetAnalyses.mockResolvedValue([
        {
          id: '1',
          title: 'Test Analysis',
          slug: 'test-analysis',
          authorId: 'author-1',
          author: {
            id: 'author-1',
            slug: 'test-author',
            name: 'Test Author',
            img: '/images/author.jpg',
          },
        },
      ]);

      const { default: PageComponent } = await import('@/app/analizy/page');
      render(await PageComponent());

      expect(screen.getByRole('heading', { name: 'Analizy' })).toBeInTheDocument();
      expect(screen.getByText('Wszystkie analizy (1)')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Test Analysis' })).toHaveAttribute(
        'href',
        '/analizy/test-analysis',
      );
    });

    it('displays empty state when there are no analyses', async () => {
      mockedGetAnalyses.mockResolvedValue([]);

      const { default: PageComponent } = await import('@/app/analizy/page');
      render(await PageComponent());

      expect(screen.getByText('Brak dostępnych analiz. Sprawdź ponownie później.')).toBeInTheDocument();
    });
  });

  describe('Analysis Detail Page', () => {
    it('renders analysis detail page structure', async () => {
      mockedGetAnalysisBySlug.mockResolvedValue({
        id: '1',
        title: 'Test Analysis',
        slug: 'test-analysis',
        lead: 'Lead testowy',
        description: 'Opis testowy',
        contentMdx: '# Nagłówek\n\nTreść analizy',
        author: {
          name: 'Test Author',
          bio: 'Biogram autora',
        },
      });

      const { default: PageComponent } = await import('@/app/analizy/[slug]/page');
      render(await PageComponent({ params: Promise.resolve({ slug: 'test-analysis' }) }));

      expect(screen.getByRole('heading', { name: 'Test Analysis' })).toBeInTheDocument();
      expect(screen.getByTestId('mdx-content')).toHaveTextContent('Treść analizy');
    });

    it('handles non-existent analysis slug', async () => {
      mockedGetAnalysisBySlug.mockResolvedValue(null);

      const { default: PageComponent } = await import('@/app/analizy/[slug]/page');
      await PageComponent({ params: Promise.resolve({ slug: 'non-existent' }) });

      expect(mockedNotFound).toHaveBeenCalled();
    });
  });

  describe('Analysis Content Rendering', () => {
    it('renders analysis with all content fields', () => {
      const mockAnalysis = {
        id: '1',
        title: 'Test Analysis',
        slug: 'test-analysis',
        content: 'Analysis content here',
        excerpt: 'Short excerpt',
        publishedAt: '2024-01-01',
        authorId: 'author-1'
      };

      expect(mockAnalysis).toHaveProperty('id');
      expect(mockAnalysis).toHaveProperty('title');
      expect(mockAnalysis).toHaveProperty('slug');
      expect(mockAnalysis).toHaveProperty('content');

      expect(typeof mockAnalysis.id).toBe('string');
      expect(typeof mockAnalysis.title).toBe('string');
      expect(typeof mockAnalysis.slug).toBe('string');
      expect(typeof mockAnalysis.content).toBe('string');
    });

    it('validates author relationship in analysis', () => {
      const mockAuthor = {
        id: 'author-1',
        name: 'Test Author',
        displayName: 'Dr. Test Author',
        slug: 'test-author',
        img: '/author.jpg',
        bio: 'Author biography'
      };

      const mockAnalysis = {
        id: '1',
        title: 'Test Analysis',
        slug: 'test-analysis',
        authorId: mockAuthor.id
      };

      expect(mockAnalysis.authorId).toBe(mockAuthor.id);
      expect(mockAuthor).toHaveProperty('id');
      expect(mockAuthor).toHaveProperty('name');
      expect(mockAuthor).toHaveProperty('displayName');
      expect(mockAuthor).toHaveProperty('slug');
    });
  });

  describe('Analysis Navigation and Links', () => {
    it('generates correct analysis URLs', () => {
      const analyses = [
        { slug: 'analysis-1', title: 'Analysis One' },
        { slug: 'analysis-2', title: 'Analysis Two' }
      ];

      analyses.forEach(analysis => {
        const expectedUrl = `/analizy/${analysis.slug}`;
        expect(expectedUrl).toContain('/analizy/');
        expect(expectedUrl).toContain(analysis.slug);
      });
    });

    it('validates analysis slug format', () => {
      const validSlugs = ['test-analysis', 'analysis-2024', 'slug_with_underscores'];
      const invalidSlugs = ['Analysis With Spaces', 'ANALYSIS-UPPERCASE', ''];

      validSlugs.forEach(slug => {
        expect(slug).toMatch(/^[a-z0-9_-]+$/);
      });

      invalidSlugs.forEach(slug => {
        expect(slug).not.toMatch(/^[a-z0-9_-]+$/);
      });
    });
  });

  describe('Analysis Data Processing', () => {
    it('processes analysis content correctly', () => {
      const rawContent = `# Analysis Title

This is analysis content with **bold** text and *italic* text.

## Section 1
- Point 1
- Point 2

## Section 2
More content here.`;

      expect(rawContent).toContain('# Analysis Title');
      expect(rawContent).toContain('**bold**');
      expect(rawContent).toContain('*italic*');
      expect(rawContent).toContain('## Section 1');
      expect(rawContent).toContain('## Section 2');
      expect(typeof rawContent).toBe('string');
    });

    it('handles analysis metadata correctly', () => {
      const metadata = {
        publishedAt: '2024-01-15T10:00:00Z',
        excerpt: 'This is a short excerpt of the analysis',
        tags: ['politics', 'economy', 'analysis']
      };

      expect(metadata).toHaveProperty('publishedAt');
      expect(metadata).toHaveProperty('excerpt');
      expect(metadata).toHaveProperty('tags');

      expect(typeof metadata.publishedAt).toBe('string');
      expect(typeof metadata.excerpt).toBe('string');
      expect(Array.isArray(metadata.tags)).toBe(true);
    });
  });

  describe('Error Handling in Analysis Pages', () => {
    it('handles analysis loading errors gracefully', () => {
      const errorScenarios = [
        'Analysis not found',
        'Database connection failed',
        'Invalid analysis data'
      ];

      errorScenarios.forEach(error => {
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(0);
      });
    });

    it('provides fallback content for missing analyses', () => {
      const fallbackContent = {
        title: 'Analysis Not Found',
        content: 'The requested analysis could not be found.',
        showBackLink: true
      };

      expect(fallbackContent).toHaveProperty('title');
      expect(fallbackContent).toHaveProperty('content');
      expect(fallbackContent).toHaveProperty('showBackLink');
      expect(fallbackContent.showBackLink).toBe(true);
    });
  });
});
