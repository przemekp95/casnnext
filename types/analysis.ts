export type RelatedReason = "bm25" | "author_fallback";

export interface ArticleRecord {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  publishedAt: string;
  excerpt: string;
  bodyText: string;
  isPublished: boolean;
}

export interface RelatedArticleLink {
  slug: string;
  title: string;
  score: number;
  reason: RelatedReason;
}

export interface RelatedArticlesResult {
  articleId: string;
  related: RelatedArticleLink[];
}

export interface AnalysisRow {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  publishedAt?: string;
  excerpt?: string;
  bodyText?: string;
  isPublished?: boolean;
  date?: string;
  lead?: string;
  description?: string;
  category?: string;
  sourceHash?: string;
  author?: {
    id: string;
    slug: string;
    name: string;
    img?: string | null;
  };
}

export interface AnalysisDetail {
  id: string;
  title: string;
  slug: string;
  date?: string;
  lead?: string;
  description?: string;
  category?: string;
  contentMdx?: string;
  sourceHash?: string;
  author?: {
    id?: string;
    slug?: string;
    name: string;
    img?: string | null;
    bio?: string;
  };
}
