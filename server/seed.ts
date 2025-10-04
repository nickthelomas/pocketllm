import { dbStorage } from "./dbStorage";

async function seed() {
  console.log("Seeding database...");

  // Check if models already exist
  const existingModels = await dbStorage.getModels();
  
  if (existingModels.length === 0) {
    // Add default local models (optimized for mobile - smallest first)
    await dbStorage.createModel({
      name: "llama3.2:1b",
      provider: "ollama",
      isAvailable: true,
      parameters: { size: 1300000000 }, // 1.3GB for sorting
    });

    await dbStorage.createModel({
      name: "qwen2:1.5b",
      provider: "ollama",
      isAvailable: true,
      parameters: { size: 900000000 }, // 0.9GB
    });

    await dbStorage.createModel({
      name: "gemma:2b",
      provider: "ollama",
      isAvailable: true,
      parameters: { size: 1400000000 }, // 1.4GB
    });

    console.log("✓ Seeded 3 mobile-optimized models");
  } else {
    console.log(`✓ Database already has ${existingModels.length} models`);
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
