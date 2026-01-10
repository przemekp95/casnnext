import { EntitySchema } from 'typeorm';

// Disable entity processing in CI to prevent TypeORM initialization issues
export const AnalysisSchema = process.env.GITHUB_ACTIONS ? null : new EntitySchema({
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
});