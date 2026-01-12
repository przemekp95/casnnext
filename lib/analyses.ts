import { AppDataSource } from "./db";
import { initializeDatabase } from "./init-db";
import { AnalysisSchema } from "./entities";
import { AnalysisRow, AnalysisDetail } from "../types/analysis";

// Mock data for development/testing
const mockAnalyses: AnalysisRow[] = [
  {
    id: "1",
    title: "Geopolityka Europy Zrodkowej",
    slug: "geopolityka-europy-srodkowej",
    authorId: "1",
    author: {
      id: "1",
      slug: "piotr-balcerowski",
      name: "Piotr Balcerowski",
      img: "/images/Balcerowski.png"
    }
  },
  {
    id: "2",
    title: "Transformacje polityczne w regionie",
    slug: "transformacje-polityczne-region",
    authorId: "1",
    author: {
      id: "1",
      slug: "piotr-balcerowski",
      name: "Piotr Balcerowski",
      img: "/images/Balcerowski.png"
    }
  },
  {
    id: "3",
    title: "BezpieczeDstwo cybernetyczne",
    slug: "bezpieczenstwo-cybernetyczne",
    authorId: "2",
    author: {
      id: "2",
      slug: "anna-domanska",
      name: "Anna DomaDska",
      img: "/images/Domanska.png"
    }
  },
  {
    id: "4",
    title: "Transformacja cyfrowa w administracji",
    slug: "transformacja-cyfrowa-administracji",
    authorId: "2",
    author: {
      id: "2",
      slug: "anna-domanska",
      name: "Anna DomaDska",
      img: "/images/Domanska.png"
    }
  },
  {
    id: "5",
    title: "Prawo midzynarodowe w erze cyfrowej",
    slug: "prawo-miedzynarodowe-era-cyfrowa",
    authorId: "3",
    author: {
      id: "3",
      slug: "marek-feszler",
      name: "Marek Feszler",
      img: "/images/Feszler.png"
    }
  },
  {
    id: "6",
    title: "Rynek energii w Europie",
    slug: "rynek-energii-europie",
    authorId: "4",
    author: {
      id: "4",
      slug: "katarzyna-gursztyn",
      name: "Katarzyna Gursztyn",
      img: "/images/Gursztyn.png"
    }
  }
];

// Mock analysis details
const mockAnalysisDetails: Record<string, AnalysisDetail> = {
  "geopolityka-europy-srodkowej": {
    id: "1",
    title: "Geopolityka Europy Zrodkowej",
    slug: "geopolityka-europy-srodkowej",
    author: {
      name: "Piotr Balcerowski",
      bio: "Analityk polityczny specjalizujcy si w geopolityce Europy Zrodkowej i Wschodniej."
    }
  },
  "bezpieczenstwo-cybernetyczne": {
    id: "3",
    title: "BezpieczeDstwo cybernetyczne",
    slug: "bezpieczenstwo-cybernetyczne",
    author: {
      name: "Anna DomaDska",
      bio: "Ekspertka ds. bezpieczeDstwa midzynarodowego i transformacji cyfrowej."
    }
  }
};

export async function getAnalyses(): Promise<AnalysisRow[]> {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return [];
  }

  // Ensure database is initialized
  if (AppDataSource && !AppDataSource.isInitialized) {
    await initializeDatabase();
  }

  if (!AppDataSource || !AppDataSource.isInitialized) {
    console.warn('Database not available for getAnalyses(), using mock data');
    return mockAnalyses;
  }

  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
  const analyses = await analysisRepository.find({
    relations: {
      author: true,
    },
    order: { id: 'DESC' },
  });

  // Transform to UI-friendly format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = analyses.map((analysis: any) => ({
    id: String(analysis.id),
    title: String(analysis.title),
    slug: String(analysis.slug),
    authorId: String(analysis.authorId),
    author: analysis.author ? {
      id: String(analysis.author.id),
      slug: String(analysis.author.slug),
      name: String(analysis.author.name),
      img: analysis.author.img ?? null,
    } : undefined,
  }));

  return result;
}

export async function getAnalysisBySlug(slug: string): Promise<AnalysisDetail | null> {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null;
  }

  // Ensure database is initialized
  if (AppDataSource && !AppDataSource.isInitialized) {
    await initializeDatabase();
  }

  if (!AppDataSource || !AppDataSource.isInitialized) {
    console.warn('Database not available for getAnalysisBySlug(), using mock data');
    return mockAnalysisDetails[slug] || null;
  }

  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);

  // U|yj findOne zamiast query builder dla prostoty i niezawodno[ci
  const analysis = await analysisRepository.findOne({
    where: { slug },
    relations: {
      author: true,
    },
  });

  if (!analysis) {
    return null;
  }

  // Transform to UI-friendly format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const author = (analysis as any).author;
  return {
    id: String(analysis.id),
    title: analysis.title,
    slug: analysis.slug,
    author: author ? {
      name: author.name || undefined,
      bio: author.bio || undefined,
    } : undefined,
  };
}