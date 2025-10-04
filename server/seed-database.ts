import { db } from "./db";
import { settings } from "@shared/schema";

export async function seedDefaultSettings() {
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
    }
    
    console.log("✅ Database seeding complete");
    return true;
  } catch (err) {
    console.error("❌ Database seed error:", err);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  seedDefaultSettings()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
