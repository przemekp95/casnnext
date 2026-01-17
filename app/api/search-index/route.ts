import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { NextResponse } from "next/server";
import { stripMarkdown, createExcerpt } from "@/lib/searchUtils";
import { AppDataSource } from "@/lib/db.server";
import { AnalysisSchema } from "@/lib/entities";

// Typy dla indeksu wyszukiwania
interface SearchIndexItem {
  slug: string;
  title: string;
  author: string;
  date: string;
  excerpt: string;
  content: string;
}

export async function GET() {
  try {
    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([]);
    }

    // Sprawdź połączenie z bazą danych
    if (!AppDataSource || !AppDataSource.isInitialized) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Pobierz wszystkie analizy z bazy danych
    const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
    const analyses = await analysisRepository.find({
      relations: ['author'],
      order: { id: 'DESC' },
    });

    // Ścieżka do katalogu z postami
    const POSTS_DIR = process.env.APP_ROOT
      ? path.join(process.env.APP_ROOT, "posts")
      : path.join(process.cwd(), "posts");

    // Sprawdź czy katalog istnieje
    if (!fs.existsSync(POSTS_DIR)) {
      return NextResponse.json({ error: "Posts directory not found" }, { status: 404 });
    }

    const searchIndex: SearchIndexItem[] = [];

    // Przetwórz tylko analizy które istnieją w bazie danych
    for (const analysis of analyses) {
      try {
        const slug = analysis.slug;
        const filePath = path.join(POSTS_DIR, `${slug}.mdx`);

        // Sprawdź czy plik istnieje
        if (!fs.existsSync(filePath)) {
          console.warn(`File ${slug}.mdx not found, skipping`);
          continue;
        }

        // Sprawdź rozmiar pliku (bezpieczeństwo)
        const stats = fs.statSync(filePath);
        if (stats.size > 2_000_000) { // 2MB limit
          console.warn(`File ${slug}.mdx too large, skipping`);
          continue;
        }

        // Przeczytaj i sparsuj plik
        const source = fs.readFileSync(filePath, "utf8");
        const { content } = matter(source);

        // Użyj danych z bazy danych zamiast z frontmatter
        const title = analysis.title;
        const author = analysis.author?.name || "Nieznany autor";

        // Przygotuj zawartość do wyszukiwania
        const cleanContent = stripMarkdown(content);
        const excerpt = createExcerpt(content, 200);

        // Użyj aktualnej daty jeśli nie ma daty w bazie
        const date = new Date().toISOString().split('T')[0];

        searchIndex.push({
          slug,
          title,
          author,
          date,
          excerpt,
          content: cleanContent
        });

      } catch (error) {
        console.error(`Error processing ${analysis.slug}.mdx:`, error);
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