import { EntitySchema } from 'typeorm';

export interface AnalysisEntity {
  id: number;
  title: string;
  slug: string;
  authorId: number;
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