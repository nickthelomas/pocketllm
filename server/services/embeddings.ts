import Anthropic from "@anthropic-ai/sdk";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

export interface EmbeddingResponse {
  embedding: number[];
}

export class EmbeddingService {
  private modelName: string;

  constructor(modelName: string = "nomic-embed-text") {
    this.modelName = modelName;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelName,
          prompt: text,
        }),
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
