export interface AnalysisRow {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  author?: {
    id: string;
    name: string;
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