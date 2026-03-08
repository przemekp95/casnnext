import { EntitySchema } from 'typeorm';

export interface AuthorEntity {
  id: number;
  slug: string;
  name: string;
  displayName: string;
  img?: string | null;
  bio?: string | null;
  strapiId?: number | null;
  sourceHash?: string | null;
  publishedAt?: Date | null;
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
    analyses: {
      type: 'one-to-many',
      target: 'Analysis',
      inverseSide: 'author',
    },
  },
});
