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
      type: String,
      length: 191,
      unique: true,
    },
    name: {
      type: String,
      length: 255,
    },
    img: {
      type: String,
      length: 255,
    },
    bio: {
      type: 'text',
    },
  },
});