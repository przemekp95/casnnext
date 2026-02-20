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
  analyses: Array<{
    id: string;
    title: string;
    slug: string;
  }>;
}
