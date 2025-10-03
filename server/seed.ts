import { dbStorage } from "./dbStorage";

async function seed() {
  console.log("Seeding database...");

  // Check if models already exist
  const existingModels = await dbStorage.getModels();
  
  if (existingModels.length === 0) {
    // Add default local models
    await dbStorage.createModel({
      name: "llama3.2:3b-instruct",
      provider: "ollama",
      isAvailable: true,
      parameters: null,
    });

    await dbStorage.createModel({
      name: "mistral:7b-instruct-v0.2",
      provider: "ollama",
      isAvailable: true,
      parameters: null,
    });

    await dbStorage.createModel({
      name: "qwen2.5:7b-instruct",
      provider: "ollama",
      isAvailable: true,
      parameters: null,
    });

    console.log("✓ Seeded 3 default models");
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
