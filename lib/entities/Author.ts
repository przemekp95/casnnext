import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Analysis } from './Analysis';

@Entity('Author')
export class Author {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 191, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  img: string;

  @Column({ type: 'text' })
  bio: string;

  @OneToMany(() => Analysis, analysis => analysis.author)
  analyses: Analysis[];
}
