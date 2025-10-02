// Model Directory Scanner - Discovers GGUF files in local filesystem
// Allows users to load models from ./models folder for offline use

import { promises as fs } from "fs";
import path from "path";

interface LocalModel {
  name: string;
  path: string;
  size: number;
  format: string;
  provider: "local-file";
}

export class ModelDirectoryScanner {
  private modelsDir: string;

  constructor(modelsDir: string = "./models") {
    this.modelsDir = path.resolve(modelsDir);
  }

  async ensureModelsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.modelsDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create models directory:", error);
    }
  }

  async scanModels(): Promise<LocalModel[]> {
    try {
      await this.ensureModelsDirectory();
      const files = await fs.readdir(this.modelsDir);
      const models: LocalModel[] = [];

      for (const file of files) {
        if (this.isModelFile(file)) {
          const fullPath = path.join(this.modelsDir, file);
          const stats = await fs.stat(fullPath);

          models.push({
            name: this.extractModelName(file),
            path: fullPath,
            size: stats.size,
            format: this.getFileFormat(file),
            provider: "local-file",
          });
        }
      }

      return models;
    } catch (error) {
      console.error("Failed to scan models directory:", error);
      return [];
    }
  }

  private isModelFile(filename: string): boolean {
    const modelExtensions = [".gguf", ".ggml", ".bin"];
    return modelExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  }

  private getFileFormat(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".gguf") return "GGUF";
    if (ext === ".ggml") return "GGML";
    if (ext === ".bin") return "BIN";
    return "UNKNOWN";
  }

  private extractModelName(filename: string): string {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.(gguf|ggml|bin)$/i, "");
    
    // Clean up common patterns
    return nameWithoutExt
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async getModelPath(modelName: string): Promise<string | null> {
    const models = await this.scanModels();
    const model = models.find((m) => m.name === modelName);
    return model?.path || null;
  }

  async deleteModel(modelName: string): Promise<boolean> {
    try {
      const modelPath = await this.getModelPath(modelName);
      if (!modelPath) return false;

      await fs.unlink(modelPath);
      return true;
    } catch (error) {
      console.error("Failed to delete model:", error);
      return false;
    }
  }
}

export const modelDirectoryScanner = new ModelDirectoryScanner();
