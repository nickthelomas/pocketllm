import Anthropic from "@anthropic-ai/sdk";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

export interface EmbeddingResponse {
  embedding: number[];
}

export interface GPUOptions {
  num_gpu?: number;
  num_thread?: number;
  num_ctx?: number;
  num_batch?: number;
  main_gpu?: number;
  low_vram?: boolean;
}

export class EmbeddingService {
  private modelName: string;
  private gpuOptions?: GPUOptions;

  constructor(modelName: string = "nomic-embed-text", gpuOptions?: GPUOptions) {
    this.modelName = modelName;
    this.gpuOptions = gpuOptions;
  }

  setGPUOptions(options: GPUOptions) {
    this.gpuOptions = options;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const requestBody: any = {
        model: this.modelName,
        prompt: text,
      };

      // Add GPU options if available
      if (this.gpuOptions) {
        const options: any = {};
        
        if (this.gpuOptions.num_gpu !== undefined) options.num_gpu = this.gpuOptions.num_gpu;
        if (this.gpuOptions.num_thread !== undefined) options.num_thread = this.gpuOptions.num_thread;
        if (this.gpuOptions.num_ctx !== undefined) options.num_ctx = this.gpuOptions.num_ctx;
        if (this.gpuOptions.num_batch !== undefined) options.num_batch = this.gpuOptions.num_batch;
        if (this.gpuOptions.main_gpu !== undefined) options.main_gpu = this.gpuOptions.main_gpu;
        if (this.gpuOptions.low_vram !== undefined) options.low_vram = this.gpuOptions.low_vram;
        
        if (Object.keys(options).length > 0) {
          requestBody.options = options;
          console.log(`🎮 Using GPU options for embeddings:`, options);
        }
      }

      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.warn(`Ollama embedding failed (${response.status}), using fallback`);
        return this.generateFallbackEmbedding(text);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.warn("Ollama embedding error, using fallback:", error);
      return this.generateFallbackEmbedding(text);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      texts.map(text => this.generateEmbedding(text))
    );
    return embeddings;
  }

  private generateFallbackEmbedding(text: string): number[] {
    const dimensions = 768;
    const embedding = new Array(dimensions).fill(0);
    
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    for (let i = 0; i < dimensions; i++) {
      const seed = hash + i;
      embedding[i] = Math.sin(seed) * 0.5 + 0.5;
    }
    
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
  }
}

export const embeddingService = new EmbeddingService();
