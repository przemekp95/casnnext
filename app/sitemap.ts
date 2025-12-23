import { MetadataRoute } from 'next'
import mysql from 'mysql2/promise'

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

// Funkcja do pobierania artykułów z bazy danych podczas builda lub z API w runtime
async function getArticles(): Promise<ArticleRow[]> {
  // Podczas builda użyj bezpośredniego dostępu do bazy danych
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'casn_user',
        password: process.env.DB_PASS || 'casn_pass',
        database: process.env.DB_NAME || 'casn',
        port: parseInt(process.env.DB_PORT || '3306'),
      });

      const [rows] = await connection.execute(`
        SELECT
          a.id,
          a.title,
          a.slug,
          a.authorId,
          au.name as author_name,
          au.slug as author_slug
        FROM Analysis a
        LEFT JOIN Author au ON a.authorId = au.id
        ORDER BY a.id DESC
      `);

      await connection.end();

      return rows as ArticleRow[];
    } catch (error) {
      console.warn('Błąd podczas pobierania artykułów z bazy dla sitemapy podczas builda:', error);
      return [];
    }
  }

  // W runtime użyj API
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/articles`, {
      next: { revalidate: 3600 } // Revalidate co godzinę
    });

    if (!response.ok) {
      console.warn('Nie udało się pobrać artykułów dla sitemapy');
      return [];
    }

    return await response.json();
  } catch (error) {
    console.warn('Błąd podczas pobierania artykułów dla sitemapy:', error);
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
