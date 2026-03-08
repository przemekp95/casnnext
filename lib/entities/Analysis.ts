import { EntitySchema } from 'typeorm';

export interface AnalysisEntity {
  id: number;
  title: string;
  slug: string;
  authorId: number;
  lead?: string | null;
  description?: string | null;
  date?: string | null;
  category?: string | null;
  contentMdx?: string | null;
  strapiId?: number | null;
  sourceHash?: string | null;
  publishedAt?: Date | null;
  author?: unknown;
}

export const AnalysisSchema = new EntitySchema<AnalysisEntity>({
  name: 'Analysis',
  tableName: 'Analysis',
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true,
    },
    title: {
      type: String,
      length: 255,
    },
    slug: {
      type: String,
      length: 191,
      unique: true,
    },
    authorId: {
      type: Number,
    },
    lead: {
      type: "text",
      nullable: true,
    },
    description: {
      type: "text",
      nullable: true,
    },
    date: {
      type: "date",
      nullable: true,
    },
    category: {
      type: String,
      length: 255,
      nullable: true,
    },
    contentMdx: {
      type: "longtext",
      nullable: true,
    },
    strapiId: {
      type: Number,
      unique: true,
      nullable: true,
    },
    sourceHash: {
      type: String,
      length: 191,
      nullable: true,
    },
    publishedAt: {
      type: Date,
      nullable: true,
    },
  },
  relations: {
    author: {
      type: 'many-to-one',
      target: 'Author',
      joinColumn: {
        name: 'authorId',
      },
    },
  },
});
