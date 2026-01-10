import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Author } from './entities/Author';
import { Analysis } from './entities/Analysis';

const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'casn',
  synchronize: !isProduction, // Use migrations in production
  logging: !isProduction,
  entities: [Author, Analysis],
  migrations: isProduction ? ['dist/migrations/*.js'] : ['lib/migrations/*.ts'],
  subscribers: [],
});
