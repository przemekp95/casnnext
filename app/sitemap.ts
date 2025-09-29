import { MetadataRoute } from 'next'

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

// Funkcja do pobierania artykułów z API
async function getArticles(): Promise<ArticleRow[]> {
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
