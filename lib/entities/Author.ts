import { EntitySchema } from 'typeorm';

export interface AuthorEntity {
  id: number;
  slug: string;
  name: string;
  displayName: string;
  img?: string | null;
  bio?: string | null;
  analyses?: unknown[];
}

export const AuthorSchema = new EntitySchema<AuthorEntity>({
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
    displayName: {
      type: String,
      length: 255,
    },
    img: {
      type: String,
      length: 255,
      nullable: true,
    },
    bio: {
      type: String,
      nullable: true,
    },
  },
  relations: {
    analyses: {
      type: 'one-to-many',
      target: 'Analysis',
      inverseSide: 'author',
    },
  },
});