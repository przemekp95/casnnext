import { computeRelatedArticlesResult } from "@/lib/server/related-analyses";
import type { AnalysisRow } from "@/types/analysis";

function createAnalysis(overrides: Partial<AnalysisRow>): AnalysisRow {
  return {
    id: "1",
    title: "Analiza",
    slug: "analiza",
    authorId: "author-1",
    publishedAt: "2026-01-01T00:00:00.000Z",
    excerpt: "",
    bodyText: "",
    isPublished: true,
    ...overrides,
  };
}

describe("lib/server/related-analyses", () => {
  it("returns exactly 4 unique links without self-link", () => {
    const analyses: AnalysisRow[] = [
      createAnalysis({
        id: "a1",
        slug: "current",
        title: "Geopolityka energii",
        bodyText: "energetyka geopolityka surowce infrastruktura",
        excerpt: "energia i geopolityka",
      }),
      createAnalysis({
        id: "a2",
        slug: "candidate-1",
        authorId: "author-2",
        title: "Energetyka i bezpieczeństwo",
        bodyText: "energetyka bezpieczeństwo geopolityka atom",
      }),
      createAnalysis({
        id: "a3",
        slug: "candidate-2",
        authorId: "author-3",
        title: "Infrastruktura krytyczna",
        bodyText: "infrastruktura surowce energetyka przemysł",
      }),
      createAnalysis({
        id: "a4",
        slug: "candidate-3",
        authorId: "author-4",
        title: "Rynek paliw",
        bodyText: "paliwa surowce rynek energetyka",
      }),
      createAnalysis({
        id: "a5",
        slug: "candidate-4",
        authorId: "author-5",
        title: "Transformacja sektora energii",
        bodyText: "transformacja energetyka inwestycje geopolityka",
      }),
      createAnalysis({
        id: "a6",
        slug: "candidate-5",
        authorId: "author-6",
        title: "Rolnictwo i handel",
        bodyText: "rolnictwo handel żywność eksport",
      }),
    ];

    const result = computeRelatedArticlesResult(analyses, "current");

    expect(result).not.toBeNull();
    expect(result?.related).toHaveLength(4);
    expect(result?.related.every((item) => item.slug !== "current")).toBe(true);

    const uniqueSlugs = new Set(result?.related.map((item) => item.slug));
    expect(uniqueSlugs.size).toBe(4);
  });

  it("fills missing entries with same-author first, then newest global", () => {
    const analyses: AnalysisRow[] = [
      createAnalysis({
        id: "b1",
        slug: "current",
        authorId: "author-1",
        title: "Xenon zephyr",
        bodyText: "xenonzephyr qqqq",
        excerpt: "xenonzephyr",
      }),
      createAnalysis({
        id: "b2",
        slug: "same-author-newer",
        authorId: "author-1",
        publishedAt: "2026-02-01T00:00:00.000Z",
        title: "A",
        bodyText: "abcd efgh",
      }),
      createAnalysis({
        id: "b3",
        slug: "same-author-older",
        authorId: "author-1",
        publishedAt: "2025-01-01T00:00:00.000Z",
        title: "B",
        bodyText: "ijkl mnop",
      }),
      createAnalysis({
        id: "b4",
        slug: "global-newest",
        authorId: "author-2",
        publishedAt: "2026-03-01T00:00:00.000Z",
        title: "C",
        bodyText: "rstu vwxy",
      }),
      createAnalysis({
        id: "b5",
        slug: "global-older",
        authorId: "author-3",
        publishedAt: "2024-01-01T00:00:00.000Z",
        title: "D",
        bodyText: "zzzz yyyy",
      }),
    ];

    const result = computeRelatedArticlesResult(analyses, "current");

    expect(result).not.toBeNull();
    expect(result?.related).toHaveLength(4);
    expect(result?.related[0]).toMatchObject({
      slug: "same-author-newer",
      reason: "author_fallback",
    });
    expect(result?.related[1]).toMatchObject({
      slug: "same-author-older",
      reason: "author_fallback",
    });
    expect(result?.related[2]).toMatchObject({
      slug: "global-newest",
      reason: "author_fallback",
    });
    expect(result?.related[3]).toMatchObject({
      slug: "global-older",
      reason: "author_fallback",
    });
  });
});
