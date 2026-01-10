import { DataSource } from 'typeorm';
import { AuthorSchema } from './entities/Author';
import { AnalysisSchema } from './entities/Analysis';

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
  entities: [AuthorSchema, AnalysisSchema],
  migrations: isProduction ? ['dist/migrations/*.js'] : ['lib/migrations/*.ts'],
  subscribers: [],
});
