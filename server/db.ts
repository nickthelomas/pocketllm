import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Lazy initialization - only create pool when DATABASE_URL exists
// This allows the file to be imported without errors when using MemStorage
let _db: ReturnType<typeof drizzle> | null = null;

export const getDb = () => {
  if (_db) return _db;
  
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  _db = drizzle(pool, { schema });
  return _db;
};

// For backwards compatibility - but will throw if DATABASE_URL not set
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  }
});
