export interface AuthorRow {
  id: string;
  slug: string;
  name: string;
  img?: string | null;
  bio?: string | null;
}

export interface AuthorDetail {
  author: {
    id: string;
    slug: string;
    name: string;
    img?: string | null;
    bio?: string | null;
  };
  analyses: Array<{
    id: string;
    title: string;
    slug: string;
  }>;
}