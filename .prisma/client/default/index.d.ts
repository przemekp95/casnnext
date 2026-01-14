export class PrismaClient {
  constructor(options?: any);
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  author: any;
  analysis: any;
}

export type Author = {
  id: number;
  slug: string;
  name: string;
  img?: string;
  bio?: string;
};

export type Analysis = {
  id: number;
  title: string;
  slug: string;
  authorId: number;
};
