import { EntitySchema } from "typeorm";

export interface IssueCollectionEntity {
  id: number;
  year: number;
  title: string;
  fileUrl: string;
  coverUrl?: string | null;
  strapiId?: number | null;
  sourceHash?: string | null;
  publishedAt?: Date | null;
}

export const IssueCollectionSchema = new EntitySchema<IssueCollectionEntity>({
  name: "IssueCollection",
  tableName: "IssueCollection",
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true,
    },
    year: {
      type: Number,
      unique: true,
    },
    title: {
      type: String,
      length: 255,
    },
    fileUrl: {
      type: String,
      length: 2048,
    },
    coverUrl: {
      type: String,
      length: 2048,
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
});
