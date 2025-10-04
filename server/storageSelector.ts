// Storage selector - Choose between MemStorage and DbStorage based on environment
import { MemStorage } from "./storage";
import { DbStorage } from "./dbStorage";
import type { IStorage } from "./storage";

// For Termux/offline deployments, use MemStorage
// For cloud deployments with DATABASE_URL, use DbStorage
export function createStorage(): IStorage {
  const useMemStorage = process.env.USE_MEMSTORAGE === "true" || !process.env.DATABASE_URL;
  
  if (useMemStorage) {
    console.log("📦 Using MemStorage (in-memory, offline-ready)");
    return new MemStorage();
  } else {
    console.log("📦 Using DbStorage (PostgreSQL via DATABASE_URL)");
    return new DbStorage();
  }
}

// Export singleton instance
export const storage = createStorage();
