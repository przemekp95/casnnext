export interface CmsAuthor {
  id: number;
  legacyId: number | null;
  slug: string;
  name: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  legacyImgPath: string | null;
  sourceHash: string | null;
  publishedAt?: string | null;
}

export interface CmsAnalysis {
  id: number;
  legacyId: number | null;
  slug: string;
  title: string;
  lead: string | null;
  description: string | null;
  date: string | null;
  category: string | null;
  contentMdx: string;
  sourceHash: string | null;
  author: CmsAuthor | null;
  publishedAt?: string | null;
}

export interface CmsIssue {
  id: number;
  year: number;
  title: string;
  fileUrl: string | null;
  coverUrl: string | null;
  publishedAt?: string | null;
}

export interface StrapiListResponse<T = unknown> {
  data: T[];
  meta?: unknown;
}

export interface StrapiSingleResponse<T = unknown> {
  data: T | null;
  meta?: unknown;
}
