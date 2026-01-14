import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

@Entity('Analysis')
export class Analysis {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 191, unique: true })
  slug!: string;

  @Column({ type: 'int' })
  authorId!: number;

  @ManyToOne('Author', 'analyses')
  author?: any;
}

// Legacy export for backward compatibility
export interface AnalysisEntity {
  id: number;
  title: string;
  slug: string;
  authorId: number;
  author?: unknown;
}

export const AnalysisSchema = Analysis;