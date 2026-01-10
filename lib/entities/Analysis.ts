import 'reflect-metadata';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Author } from './Author';

@Entity('Analysis')
export class Analysis {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 191, unique: true })
  slug: string;

  @Column({ type: 'int' })
  authorId: number;

  @ManyToOne(() => Author, author => author.analyses, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorId' })
  author: Author;
}
