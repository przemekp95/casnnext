// Database initialization file to ensure entities are registered
// This file should be imported in the main application to ensure
// TypeORM entities are available in production builds

import { AppDataSource } from './db';

// Import entities to ensure they're registered with TypeORM
import './entities/Author';
import './entities/Analysis';

export async function initializeDatabase() {
  if (!AppDataSource.isInitialized) {
    try {
      console.log('Initializing database connection...');
      await AppDataSource.initialize();
      console.log('Database connection established successfully');

      // In production, ensure schema is synchronized if needed
      if (process.env.NODE_ENV === 'production') {
        console.log('Running database synchronization for production...');
        await AppDataSource.synchronize(false);
        console.log('Database schema synchronized');
      }
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  } else {
    console.log('Database already initialized');
  }

  return AppDataSource;
}

// Export the data source for convenience
export { AppDataSource };