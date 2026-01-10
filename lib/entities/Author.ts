import { EntitySchema } from 'typeorm';

export const AuthorSchema = new EntitySchema({
  name: 'Author',
  tableName: 'Author',
  columns: {
    id: {
      type: Number,
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
  relations: {
    analyses: {
      type: 'one-to-many',
      target: 'Analysis',
      inverseSide: 'author',
      cascade: false,
    },
  },
});
