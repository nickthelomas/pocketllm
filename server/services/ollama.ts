// Ollama Service - Wrapper for local Ollama REST API
// Provides integration with locally-running Ollama for model management and inference
// Documentation: https://github.com/ollama/ollama/blob/main/docs/api.md

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  stop?: string[];
  stream?: boolean;
  context?: number[];
  seed?: number;
}

interface OllamaGenerateChunk {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaService {
  private baseUrl: string;
  private loadedModel: string | null = null;

  constructor(baseUrl: string = "http://127.0.0.1:11434") {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getLoadedModel(): string | null {
    return this.loadedModel;
  }

  async loadModel(modelName: string): Promise<void> {
    try {
      console.log(`🔄 Loading model: ${modelName}...`);
      
      // First verify the model exists in Ollama
      const models = await this.listModels();
      const modelExists = models.some(m => m.name === modelName);
      if (!modelExists) {
        throw new Error(`Model "${modelName}" not found in Ollama. Please pull it first.`);
      }
      
      // Warm up the model with a test prompt and validate response
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          prompt: "test",
          stream: false
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load model: ${response.statusText} - ${errorText}`);
      }

      // Validate the response actually worked
      const result = await response.json();
      if (!result.response && result.response !== "") {
        throw new Error(`Model loaded but returned invalid response format`);
      }

      this.loadedModel = modelName;
      console.log(`✅ Model loaded and ready: ${modelName}`);
    } catch (error) {
      this.loadedModel = null; // Clear loaded model on failure
      console.error(`❌ Failed to load model ${modelName}:`, error);
      
      // Provide more helpful error messages
      if (error instanceof Error) {
        if (error.message.includes("timeout") || error.message.includes("AbortError")) {
          throw new Error(`Model "${modelName}" took too long to load (>30s). Try a smaller model.`);
        }
        if (error.message.includes("ECONNREFUSED")) {
          throw new Error(`Cannot connect to Ollama server. Is it running?`);
        }
      }
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error("Failed to list Ollama models:", error);
      throw error;
    }
  }

  async pullModel(modelName: string, onProgress?: (progress: number, status: string) => void): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.status && onProgress) {
              const progress = data.completed && data.total ? (data.completed / data.total) * 100 : 0;
              onProgress(progress, data.status);
            }
          } catch (e) {
            console.error("Failed to parse pull progress:", e);
          }
        }
      }
    } catch (error) {
      console.error("Failed to pull model:", error);
      throw error;
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete model: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to delete model:", error);
      throw error;
    }
  }

  async *generateStream(request: OllamaGenerateRequest): AsyncGenerator<OllamaGenerateChunk> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Ollama generate error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk: OllamaGenerateChunk = JSON.parse(line);
            yield chunk;
            if (chunk.done) return;
          } catch (e) {
            console.error("Failed to parse chunk:", e);
          }
        }
      }
    } catch (error) {
      console.error("Ollama stream error:", error);
      throw error;
    }
  }

  async generate(request: OllamaGenerateRequest): Promise<string> {
    let fullResponse = "";
    for await (const chunk of this.generateStream(request)) {
      fullResponse += chunk.response;
    }
    return fullResponse;
  }

  async showModel(modelName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to show model: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to show model:", error);
      throw error;
    }
  }
}

export const ollamaService = new OllamaService();
