import { MetadataRoute } from 'next'
import { executeRscQuery } from '@/lib/db.rsc'
import { AnalysisSchema } from '@/lib/entities'

// Ensure dynamic generation
export const dynamic = 'force-dynamic';

// Typy danych dla artykułów i autorów
type ArticleRow = {
  id: number;
  title: string;
  slug: string;
  authorId: number;
  author_name: string | null;
  author_slug: string | null;
};

type AuthorRow = {
  id: number;
  name: string;
  slug: string;
};

// Funkcja do pobierania artykułów z bazy danych przy użyciu RSC approach
async function getArticles(): Promise<ArticleRow[]> {
  try {
    return await executeRscQuery(async (dataSource) => {
      const analysisRepository = dataSource.getRepository(AnalysisSchema);
      const analyses = await analysisRepository.find({
        relations: {
          author: true,
        },
        order: { id: 'DESC' },
      });

      // Transform to UI-friendly format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = analyses.map((analysis: any) => ({
        id: analysis.id,
        title: analysis.title,
        slug: analysis.slug,
        authorId: analysis.authorId,
        author_name: analysis.author?.name || null,
        author_slug: analysis.author?.slug || null,
      }));

      return result;
    });
  } catch (error) {
    console.warn('Database not available for sitemap articles:', error);
    return [];
  }
}

// Funkcja do pobierania autorów z artykułów (wyciąga unikalnych autorów)
async function getAuthors(): Promise<AuthorRow[]> {
  try {
    const articles = await getArticles();

    // Wyciągnij unikalnych autorów z artykułów
    const uniqueAuthors = articles.reduce((acc, article) => {
      if (article.authorId && article.author_name && article.author_slug) {
        const authorKey = article.authorId;
        if (!acc.find(a => a.id === authorKey)) {
          acc.push({
            id: article.authorId,
            name: article.author_name,
            slug: article.author_slug
          });
        }
      }
      return acc;
    }, [] as AuthorRow[]);

    return uniqueAuthors;
  } catch (error) {
    console.warn('Błąd podczas pobierania autorów dla sitemapy:', error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://casn.pl'

  // Statyczne strony
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/zbiory`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/kontakt`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/autorzy`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
  ]

  // Pobierz dynamiczne dane
  const [articles, authors] = await Promise.all([
    getArticles(),
    getAuthors()
  ]);

  // Strony artykułów/analiz
  const analysisPages: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${baseUrl}/analizy/${article.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Strony autorów
  const authorPages: MetadataRoute.Sitemap = authors.map((author) => ({
    url: `${baseUrl}/autor/${author.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...authorPages,
    ...analysisPages,
  ]
}