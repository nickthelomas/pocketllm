// Database seeding script - Pure JavaScript for Termux compatibility
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { settings } from "../shared/schema.ts";

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema: { settings } });

async function seedDefaultSettings() {
  console.log("🌱 Seeding database with default settings...");
  
  const defaultSettings = [
    { userId: null, key: "baseApiUrl", value: "http://127.0.0.1:11434" },
    { userId: null, key: "temperature", value: "0.7" },
    { userId: null, key: "topP", value: "0.9" },
    { userId: null, key: "topK", value: "40" },
    { userId: null, key: "maxTokens", value: "2048" },
    { userId: null, key: "rawMessageCount", value: "10" },
    { userId: null, key: "summaryFrequency", value: "10" },
    { userId: null, key: "tokenBudget", value: "4000" },
    { userId: null, key: "chunkSize", value: "512" },
    { userId: null, key: "ragTopK", value: "5" }
  ];

  try {
    for (const setting of defaultSettings) {
      try {
        const existing = await db.query.settings.findFirst({
          where: (s, { and, eq, isNull }) => 
            and(
              isNull(s.userId),
              eq(s.key, setting.key)
            )
        });

        if (!existing) {
          await db.insert(settings).values(setting);
          console.log(`  ✓ Created setting: ${setting.key} = ${setting.value}`);
        } else {
          console.log(`  ⊙ Setting already exists: ${setting.key}`);
        }
      } catch (err) {
        console.log(`  ⚠ Skipped setting ${setting.key}:`, err.message);
      }
    }
    
    console.log("✅ Database seeding complete");
    await pool.end();
    return true;
  } catch (err) {
    console.error("❌ Database seed error:", err.message);
    await pool.end();
    return false;
  }
}

// Run seeding
seedDefaultSettings()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
