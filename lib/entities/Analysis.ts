import { EntitySchema } from 'typeorm';

export const AnalysisSchema = new EntitySchema({
  name: 'Analysis',
  tableName: 'Analysis',
  columns: {
    id: {
      type: 'int',
      primary: true,
      generated: true,
    },
    title: {
      type: 'varchar',
      length: 255,
    },
    slug: {
      type: 'varchar',
      length: 191,
      unique: true,
    },
    authorId: {
      type: 'int',
    },
  },
  relations: {
    author: {
      type: 'many-to-one',
      target: 'Author',
      joinColumn: { name: 'authorId' },
    },
  },
} as const);