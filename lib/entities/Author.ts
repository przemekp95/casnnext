import { EntitySchema } from 'typeorm';

// Disable entity processing in CI to prevent TypeORM initialization issues
export const AuthorSchema = process.env.GITHUB_ACTIONS ? null : new EntitySchema({
  name: 'Author',
  tableName: 'Author',
  columns: {
    id: {
      type: 'int',
      primary: true,
      generated: true,
    },
    slug: {
      type: 'varchar',
      length: 191,
      unique: true,
    },
    name: {
      type: 'varchar',
      length: 255,
    },
    img: {
      type: 'varchar',
      length: 255,
    },
    bio: {
      type: 'text',
    },
  },
});