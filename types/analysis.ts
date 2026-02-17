export interface AnalysisRow {
  id: string;
  title: string;
  slug: string;
  authorId: string;
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
