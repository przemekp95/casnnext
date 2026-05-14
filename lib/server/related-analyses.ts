import "server-only";

import { unstable_cache } from "next/cache";
import { getAnalyses } from "@/lib/analyses";
import type {
  AnalysisRow,
  RelatedArticleLink,
  RelatedArticlesResult,
} from "@/types/analysis";

const MAX_RELATED = 4;
const BM25_K1 = 1.5;
const BM25_B = 0.75;
const TOKEN_PATTERN = /[0-9a-ząćęłńóśźż]+/gi;

const POLISH_STOP_WORDS = new Set([
  "a", "aby", "ach", "aj", "albo", "ale", "ani", "aż", "bardzo", "bez", "bo", "by", "być",
  "był", "była", "byli", "było", "ci", "co", "czy", "dla", "do", "gdzie", "go", "i", "ich",
  "im", "in", "jak", "jaka", "jakie", "jako", "je", "jego", "jej", "jest", "jeśli", "już",
  "kiedy", "kto", "która", "które", "który", "ku", "lub", "ma", "mają", "mam", "mi", "mnie",
  "mu", "na", "nad", "nam", "nas", "nasz", "nie", "nim", "niż", "o", "od", "oraz", "po",
  "pod", "ponieważ", "przez", "przy", "sam", "się", "są", "ta", "tak", "także", "tam", "te",
  "tego", "tej", "ten", "to", "tu", "twoje", "u", "w", "we", "więc", "wszystko", "wy", "z",
  "za", "ze", "że",
]);

type IndexedAnalysis = {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  publishedTimestamp: number;
  tokens: string[];
  termFrequency: Map<string, number>;
  length: number;
};

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function tokenize(value: string): string[] {
  const tokens = value.toLowerCase().match(TOKEN_PATTERN);
  if (!tokens) return [];
  return tokens.filter((token) => token.length > 1 && !POLISH_STOP_WORDS.has(token));
}

function buildWeightedDocumentText(analysis: AnalysisRow): string {
  const title = analysis.title ?? "";
  const category = analysis.category ?? "";
  const excerpt = analysis.excerpt ?? analysis.lead ?? analysis.description ?? "";
  const body = analysis.bodyText ?? "";

  return [title, title, category, excerpt, body].join(" ").trim();
}

function toIndexedAnalysis(analysis: AnalysisRow): IndexedAnalysis {
  const tokens = tokenize(buildWeightedDocumentText(analysis));
  const termFrequency = new Map<string, number>();

  for (const token of tokens) {
    termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
  }

  return {
    id: analysis.id,
    slug: analysis.slug,
    title: analysis.title,
    authorId: analysis.authorId,
    publishedTimestamp: toTimestamp(analysis.publishedAt ?? analysis.date),
    tokens,
    termFrequency,
    length: tokens.length,
  };
}

function buildDocumentFrequency(indexedAnalyses: IndexedAnalysis[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();

  for (const analysis of indexedAnalyses) {
    const uniqueTokens = new Set(analysis.tokens);
    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  return documentFrequency;
}

function bm25Score(
  query: IndexedAnalysis,
  candidate: IndexedAnalysis,
  documentFrequency: Map<string, number>,
  documentsCount: number,
  averageDocumentLength: number,
): number {
  if (documentsCount === 0 || averageDocumentLength <= 0) return 0;

  let score = 0;
  const queryTerms = new Set(query.tokens);

  for (const term of queryTerms) {
    const termFrequencyInDoc = candidate.termFrequency.get(term) ?? 0;
    if (termFrequencyInDoc === 0) continue;

    const df = documentFrequency.get(term) ?? 0;
    const idf = Math.log(1 + (documentsCount - df + 0.5) / (df + 0.5));
    const denominator =
      termFrequencyInDoc +
      BM25_K1 * (1 - BM25_B + BM25_B * (candidate.length / averageDocumentLength));
    const tfComponent = (termFrequencyInDoc * (BM25_K1 + 1)) / denominator;

    score += idf * tfComponent;
  }

  return Number(score.toFixed(6));
}

function buildRelatedEntries(
  current: IndexedAnalysis,
  indexedAnalyses: IndexedAnalysis[],
  documentFrequency: Map<string, number>,
  averageDocumentLength: number,
  limit: number,
): RelatedArticleLink[] {
  const selected = new Set<string>();
  const related: RelatedArticleLink[] = [];

  const bm25Candidates = indexedAnalyses
    .filter((candidate) => candidate.slug !== current.slug)
    .map((candidate) => ({
      candidate,
      score: bm25Score(
        current,
        candidate,
        documentFrequency,
        indexedAnalyses.length,
        averageDocumentLength,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.candidate.publishedTimestamp - a.candidate.publishedTimestamp;
    });

  for (const { candidate, score } of bm25Candidates) {
    if (related.length >= limit) break;
    if (selected.has(candidate.slug)) continue;

    selected.add(candidate.slug);
    related.push({
      slug: candidate.slug,
      title: candidate.title,
      score,
      reason: "bm25",
    });
  }

  const authorFallbackCandidates = indexedAnalyses
    .filter(
      (candidate) =>
        candidate.slug !== current.slug &&
        candidate.authorId === current.authorId &&
        !selected.has(candidate.slug),
    )
    .sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);

  for (const candidate of authorFallbackCandidates) {
    if (related.length >= limit) break;
    selected.add(candidate.slug);
    related.push({
      slug: candidate.slug,
      title: candidate.title,
      score: 0,
      reason: "author_fallback",
    });
  }

  const globalFallbackCandidates = indexedAnalyses
    .filter((candidate) => candidate.slug !== current.slug && !selected.has(candidate.slug))
    .sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);

  for (const candidate of globalFallbackCandidates) {
    if (related.length >= limit) break;
    selected.add(candidate.slug);
    related.push({
      slug: candidate.slug,
      title: candidate.title,
      score: 0,
      reason: "author_fallback",
    });
  }

  return related;
}

export function computeRelatedArticlesResult(
  analyses: AnalysisRow[],
  slug: string,
  limit: number = MAX_RELATED,
): RelatedArticlesResult | null {
  const published = analyses.filter(
    (analysis) => analysis.slug && analysis.isPublished !== false && analysis.title,
  );
  const indexedAnalyses = published.map(toIndexedAnalysis).filter((analysis) => analysis.slug);
  const current = indexedAnalyses.find((analysis) => analysis.slug === slug);

  if (!current) return null;

  const totalLength = indexedAnalyses.reduce((sum, analysis) => sum + analysis.length, 0);
  const averageDocumentLength =
    indexedAnalyses.length > 0 ? totalLength / indexedAnalyses.length : 0;
  const documentFrequency = buildDocumentFrequency(indexedAnalyses);
  const cappedLimit = Math.max(0, Math.min(limit, MAX_RELATED));
  const related = buildRelatedEntries(
    current,
    indexedAnalyses,
    documentFrequency,
    averageDocumentLength,
    cappedLimit,
  );

  return {
    articleId: current.id,
    related,
  };
}

async function buildRelatedArticlesMapUncached(): Promise<Record<string, RelatedArticlesResult>> {
  const analyses = await getAnalyses();
  const map: Record<string, RelatedArticlesResult> = {};

  for (const analysis of analyses) {
    const result = computeRelatedArticlesResult(analyses, analysis.slug, MAX_RELATED);
    if (result) {
      map[analysis.slug] = result;
    }
  }

  return map;
}

const getRelatedArticlesMapCached =
  typeof unstable_cache === "function"
    ? unstable_cache(buildRelatedArticlesMapUncached, ["analyses:related-map"], {
        tags: ["analyses", "articles", "authors"],
      })
    : buildRelatedArticlesMapUncached;

export async function getRelatedAnalysesBySlug(
  slug: string,
): Promise<RelatedArticlesResult | null> {
  const map =
    process.env.NODE_ENV === "test"
      ? await buildRelatedArticlesMapUncached()
      : await getRelatedArticlesMapCached();

  return map[slug] ?? null;
}
