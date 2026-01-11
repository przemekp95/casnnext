export interface AnalysisRow {
  id: string;
  title: string;
  slug: string;
  authorId: string;
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
  author?: {
    name: string;
    bio?: string;
  };
}