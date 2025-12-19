import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Lazy initialization - only connect when actually used
let sql: NeonQueryFunction<false, false> | null = null;
let dbInstance: NeonHttpDatabase<typeof schema> | null = null;

function getDatabase(): NeonHttpDatabase<typeof schema> {
  if (!dbInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    console.log('[DB] Connecting to Neon PostgreSQL...');
    sql = neon(databaseUrl);
    dbInstance = drizzle(sql, { schema });
    console.log('[DB] Database connection established.');
  }
  
  return dbInstance;
}

// Export a proxy that lazily initializes the database
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop) {
    const database = getDatabase();
    const value = database[prop as keyof typeof database];
    if (typeof value === 'function') {
      return value.bind(database);
    }
    return value;
  },
});

// Export schema for use elsewhere
export * from './schema';
