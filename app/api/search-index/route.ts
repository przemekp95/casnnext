import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { NextResponse } from "next/server";

// Typy dla indeksu wyszukiwania
interface SearchIndexItem {
  slug: string;
  title: string;
  author: string;
  date: string;
  excerpt: string;
  content: string;
}

// Funkcja do usuwania składni Markdown i tworzenia excerptu
function stripMarkdown(content: string): string {
  // Usuń nagłówki
  content = content.replace(/^#{1,6}\s+.*$/gm, '');

  // Usuń linki [tekst](url)
  content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Usuń obrazy ![alt](url)
  content = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

  // Usuń pogrubienie **tekst** i *tekst*
  content = content.replace(/\*\*([^*]+)\*\*/g, '$1');
  content = content.replace(/\*([^*]+)\*/g, '$1');

  // Usuń kod `inline`
  content = content.replace(/`([^`]+)`/g, '$1');

  // Usuń bloki kodu
  content = content.replace(/```[\s\S]*?```/g, '');

  // Usuń listy
  content = content.replace(/^[\s]*[-*+]\s+/gm, '');
  content = content.replace(/^[\s]*\d+\.\s+/gm, '');

  // Usuń nadmiarowe białe znaki
  content = content.replace(/\s+/g, ' ').trim();

  return content;
}

// Funkcja do tworzenia excerptu
function createExcerpt(content: string, maxLength: number = 150): string {
  const cleanContent = stripMarkdown(content);
  if (cleanContent.length <= maxLength) {
    return cleanContent;
  }

  // Znajdź ostatnie pełne słowo przed limitem
  const truncated = cleanContent.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }

  return truncated + '...';
}

export async function GET() {
  try {
    // Ścieżka do katalogu z postami
    const POSTS_DIR = process.env.APP_ROOT
      ? path.join(process.env.APP_ROOT, "posts")
      : path.join(process.cwd(), "posts");

    // Sprawdź czy katalog istnieje
    if (!fs.existsSync(POSTS_DIR)) {
      return NextResponse.json({ error: "Posts directory not found" }, { status: 404 });
    }

    // Przeczytaj wszystkie pliki .mdx
    const files = fs.readdirSync(POSTS_DIR)
      .filter(file => file.endsWith('.mdx'))
      .map(file => file.replace('.mdx', ''));

    const searchIndex: SearchIndexItem[] = [];

    // Przetwórz każdy plik
    for (const slug of files) {
      try {
        const filePath = path.join(POSTS_DIR, `${slug}.mdx`);

        // Sprawdź rozmiar pliku (bezpieczeństwo)
        const stats = fs.statSync(filePath);
        if (stats.size > 2_000_000) { // 2MB limit
          console.warn(`File ${slug}.mdx too large, skipping`);
          continue;
        }

        // Przeczytaj i sparsuj plik
        const source = fs.readFileSync(filePath, "utf8");
        const { data, content } = matter(source);

        // Wyciągnij potrzebne dane
        const title = data.title || "Bez tytułu";
        const author = data.author || "Nieznany autor";
        const date = data.date || "Brak daty";

        // Przygotuj zawartość do wyszukiwania
        const cleanContent = stripMarkdown(content);
        const excerpt = createExcerpt(content, 200);

        searchIndex.push({
          slug,
          title,
          author,
          date: typeof date === 'string' ? date : date.toISOString().split('T')[0],
          excerpt,
          content: cleanContent
        });

      } catch (error) {
        console.error(`Error processing ${slug}.mdx:`, error);
        // Kontynuuj przetwarzanie innych plików
      }
    }

    // Sortuj po dacie (najnowsze pierwsze)
    searchIndex.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json(searchIndex);

  } catch (error) {
    console.error("Error generating search index:", error);
    return NextResponse.json(
      { error: "Failed to generate search index" },
      { status: 500 }
    );
  }
}