export interface AuthorRow {
  id: string;
  slug: string;
  name: string;
  img?: string;
}

export interface AuthorDetail {
  author: {
    id: string;
    slug: string;
    name: string;
    img?: string;
    bio?: string;
  };
  analyses: Array<{
    id: string;
    title: string;
    slug: string;
  }>;
}