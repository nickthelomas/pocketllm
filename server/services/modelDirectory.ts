// Model Directory Scanner - Discovers GGUF files in Downloads folder
// Allows users to load models downloaded via browser for offline use

import { promises as fs } from "fs";
import path from "path";
import os from "os";

interface LocalModel {
  name: string;
  filename: string;  // Actual filename for GPU Bridge
  path: string;
  size: number;
  format: string;
  provider: "local-file";
}

interface ModelManifest {
  hiddenModels: string[];  // List of model filenames that are hidden
  lastScanTime?: number;
}

export class ModelDirectoryScanner {
  private modelsDir: string;
  private manifestPath: string;
  private manifest: ModelManifest = { hiddenModels: [] };

  constructor() {
    // Use the models folder where GPU Bridge can actually load from
    const homeDir = os.homedir();
    const primaryModels = path.join(homeDir, 'PocketLLM', 'models');
    const termuxDownloads = path.join(homeDir, 'storage', 'downloads');
    const fallbackModels = path.resolve('./models');
    
    // Store manifest in app data directory
    const appDataDir = path.join(homeDir, '.pocketllm');
    this.manifestPath = path.join(appDataDir, 'model-manifest.json');
    
    // Default to models folder for GPU Bridge compatibility
    // We'll still scan Downloads but copy to models folder
    this.modelsDir = termuxDownloads;
    
    // Initialize manifest directory
    this.ensureManifestDirectory(appDataDir);
  }
  
  private async ensureManifestDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
    }
  }
  
  private async loadManifest(): Promise<void> {
    try {
      const data = await fs.readFile(this.manifestPath, 'utf-8');
      this.manifest = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, use default
      this.manifest = { hiddenModels: [] };
    }
  }
  
  private async saveManifest(): Promise<void> {
    try {
      this.manifest.lastScanTime = Date.now();
      await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2));
    } catch (error) {
      console.error("Failed to save manifest:", error);
    }
  }

  async ensureModelsDirectory(): Promise<boolean> {
    try {
      // Check if Downloads folder is accessible
      await fs.access(this.modelsDir);
      console.log(`✓ Scanning models from: ${this.modelsDir}`);
      return true;
    } catch (error) {
      // Try fallback directory
      const fallbackDir = path.resolve('./models');
      try {
        await fs.mkdir(fallbackDir, { recursive: true });
        this.modelsDir = fallbackDir;
        console.log(`⚠️  Using fallback models directory: ${this.modelsDir}`);
        console.log(`   Run 'termux-setup-storage' to enable Downloads folder access`);
        return true;
      } catch (fallbackError) {
        console.error("Failed to access models directory:", error);
        return false;
      }
    }
  }

  async scanModels(): Promise<LocalModel[]> {
    try {
      // Load manifest to get hidden models
      await this.loadManifest();
      
      // Ensure directory is accessible
      const dirExists = await this.ensureModelsDirectory();
      if (!dirExists) return [];
      
      const files = await fs.readdir(this.modelsDir);
      const models: LocalModel[] = [];

      for (const file of files) {
        // Skip hidden models
        if (this.manifest.hiddenModels.includes(file)) {
          continue;
        }
        
        // Only look for GGUF files (GPU bridge compatible)
        if (this.isModelFile(file)) {
          const fullPath = path.join(this.modelsDir, file);
          try {
            const stats = await fs.stat(fullPath);
            
            // Skip very small files (likely not real models)
            if (stats.size < 1024 * 1024) { // Less than 1MB
              continue;
            }

            models.push({
              name: this.extractModelName(file),
              filename: file,  // Keep original filename for GPU Bridge
              path: fullPath,
              size: stats.size,
              format: "GGUF",
              provider: "local-file",
            });
          } catch (statError) {
            // File might have been deleted, skip it
            console.warn(`Could not stat file ${file}:`, statError);
          }
        }
      }
      
      console.log(`Found ${models.length} GGUF models in ${this.modelsDir}`);
      return models;
    } catch (error) {
      console.error("Failed to scan models directory:", error);
      return [];
    }
  }

  private isModelFile(filename: string): boolean {
    // Only GGUF files for GPU bridge compatibility
    return filename.toLowerCase().endsWith('.gguf');
  }

  private extractModelName(filename: string): string {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.gguf$/i, "");
    
    // Clean up common patterns but preserve model identifiers
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
  
  getModelsDir(): string {
    return this.modelsDir;
  }
  
  // Get all models including hidden ones (for unhide functionality)
  async getAllModels(includeHidden: boolean = false): Promise<LocalModel[]> {
    try {
      // Ensure directory is accessible
      const dirExists = await this.ensureModelsDirectory();
      if (!dirExists) return [];
      
      const files = await fs.readdir(this.modelsDir);
      const models: LocalModel[] = [];
      
      // Load manifest if we need to check hidden status
      if (!includeHidden) {
        await this.loadManifest();
      }

      for (const file of files) {
        // Skip hidden models unless includeHidden is true
        if (!includeHidden && this.manifest.hiddenModels.includes(file)) {
          continue;
        }
        
        // Only look for GGUF files
        if (this.isModelFile(file)) {
          const fullPath = path.join(this.modelsDir, file);
          try {
            const stats = await fs.stat(fullPath);
            
            // Skip very small files
            if (stats.size < 1024 * 1024) {
              continue;
            }

            models.push({
              name: this.extractModelName(file),
              filename: file,  // Keep original filename for GPU Bridge
              path: fullPath,
              size: stats.size,
              format: "GGUF",
              provider: "local-file",
            });
          } catch (statError) {
            console.warn(`Could not stat file ${file}:`, statError);
          }
        }
      }
      
      return models;
    } catch (error) {
      console.error("Failed to get all models:", error);
      return [];
    }
  }
  
  // Find a model by name (including hidden ones)
  async findModelByName(modelName: string, includeHidden: boolean = true): Promise<{ filename: string; path: string; isHidden: boolean } | null> {
    try {
      await this.loadManifest();
      
      // Get all files in directory
      const dirExists = await this.ensureModelsDirectory();
      if (!dirExists) return null;
      
      const files = await fs.readdir(this.modelsDir);
      
      // Look for a file matching the model name
      for (const file of files) {
        if (!this.isModelFile(file)) continue;
        
        const extractedName = this.extractModelName(file);
        if (extractedName === modelName) {
          const isHidden = this.manifest.hiddenModels.includes(file);
          
          // If not including hidden and this is hidden, skip
          if (!includeHidden && isHidden) continue;
          
          return {
            filename: file,
            path: path.join(this.modelsDir, file),
            isHidden
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error("Failed to find model by name:", error);
      return null;
    }
  }

  async hideModel(modelFilename: string): Promise<boolean> {
    try {
      await this.loadManifest();
      
      // Add to hidden list if not already there
      if (!this.manifest.hiddenModels.includes(modelFilename)) {
        this.manifest.hiddenModels.push(modelFilename);
        await this.saveManifest();
      }
      
      console.log(`Hidden model: ${modelFilename}`);
      return true;
    } catch (error) {
      console.error("Failed to hide model:", error);
      return false;
    }
  }
  
  async unhideModel(modelFilename: string): Promise<boolean> {
    try {
      await this.loadManifest();
      
      // Remove from hidden list
      const index = this.manifest.hiddenModels.indexOf(modelFilename);
      if (index > -1) {
        this.manifest.hiddenModels.splice(index, 1);
        await this.saveManifest();
      }
      
      console.log(`Unhidden model: ${modelFilename}`);
      return true;
    } catch (error) {
      console.error("Failed to unhide model:", error);
      return false;
    }
  }
  
  async getHiddenModels(): Promise<string[]> {
    await this.loadManifest();
    return this.manifest.hiddenModels;
  }

  // Legacy method - now just hides the model instead of deleting
  async deleteModel(modelName: string): Promise<boolean> {
    try {
      const models = await this.scanModels();
      const model = models.find((m) => m.name === modelName);
      if (!model) return false;
      
      // Extract filename from path
      const filename = path.basename(model.path);
      return await this.hideModel(filename);
    } catch (error) {
      console.error("Failed to delete (hide) model:", error);
      return false;
    }
  }
}

export const modelDirectoryScanner = new ModelDirectoryScanner();