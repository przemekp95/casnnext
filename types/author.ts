import type { ArticleRecord } from "@/types/analysis";

export interface AuthorRow {
  id: string;
  legacyId?: number;
  slug: string;
  name: string;
  displayName: string;
  img?: string | null;
  bio?: string | null;
  sourceHash?: string;
}

export interface AuthorDetail {
  author: {
    id: string;
    legacyId?: number;
    slug: string;
    name: string;
    displayName: string;
    img?: string | null;
    bio?: string | null;
    sourceHash?: string;
  };
  analyses: ArticleRecord[];
}
