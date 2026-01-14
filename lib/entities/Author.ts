import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

@Entity('Author')
export class Author {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 191, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  img?: string | null;

  @Column({ type: 'text', nullable: true })
  bio?: string | null;

  @OneToMany('Analysis', 'author')
  analyses?: any[];
}

// Legacy export for backward compatibility
export interface AuthorEntity {
  id: number;
  slug: string;
  name: string;
  displayName: string;
  img?: string | null;
  bio?: string | null;
  analyses?: unknown[];
}

export const AuthorSchema = Author;