import { EntitySchema } from 'typeorm';

export const AnalysisSchema = new EntitySchema({
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
});