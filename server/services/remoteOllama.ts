// Remote Ollama Service - Wrapper for remote Ollama REST API
// Provides integration with remotely-running Ollama (e.g., via Tailscale) for model management and inference
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

export class RemoteOllamaService {
  private baseUrl: string = '';
  private loadedModel: string | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getLoadedModel(): string | null {
    return this.loadedModel;
  }

  async loadModel(modelName: string): Promise<void> {
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured. Please set the remote_ollama_url in settings.');
    }

    try {
      console.log(`🔄 Loading model from remote: ${modelName}...`);
      
      // First verify the model exists in remote Ollama
      const models = await this.listModels();
      const modelExists = models.some(m => m.name === modelName);
      if (!modelExists) {
        throw new Error(`Model "${modelName}" not found on remote Ollama server. Please pull it first.`);
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
        throw new Error(`Failed to load model from remote: ${response.statusText} - ${errorText}`);
      }

      // Validate the response actually worked
      const result = await response.json();
      if (!result.response && result.response !== "") {
        throw new Error(`Model loaded but returned invalid response format`);
      }

      this.loadedModel = modelName;
      console.log(`✅ Remote model loaded and ready: ${modelName}`);
    } catch (error) {
      this.loadedModel = null; // Clear loaded model on failure
      console.error(`❌ Failed to load remote model ${modelName}:`, error);
      
      // Provide more helpful error messages for remote connections
      if (error instanceof Error) {
        if (error.message.includes("timeout") || error.message.includes("AbortError")) {
          throw new Error(`Remote model "${modelName}" took too long to load (>30s). Check network connection or try a smaller model.`);
        }
        if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
          throw new Error(`Cannot connect to remote Ollama server at ${this.baseUrl}. Is it running and accessible?`);
        }
        if (error.message.includes("ENOTFOUND") || error.message.includes("EAI_AGAIN")) {
          throw new Error(`Cannot resolve remote Ollama server hostname. Check your Tailscale connection and URL.`);
        }
        if (error.message.includes("ETIMEDOUT")) {
          throw new Error(`Connection to remote Ollama server timed out. Check network connectivity.`);
        }
      }
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.baseUrl) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000), // Longer timeout for remote
      });
      return response.ok;
    } catch (error) {
      console.log(`Remote Ollama at ${this.baseUrl} is not available:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(10000), // 10s timeout for remote
      });
      if (!response.ok) {
        throw new Error(`Remote Ollama API error: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error("Failed to list remote Ollama models:", error);
      if (error instanceof Error && (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))) {
        throw new Error(`Cannot connect to remote Ollama server at ${this.baseUrl}`);
      }
      throw error;
    }
  }

  async pullModel(modelName: string, onProgress?: (progress: number, status: string) => void): Promise<void> {
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model on remote server: ${response.statusText}`);
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
      console.error("Failed to pull model on remote server:", error);
      throw error;
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete model on remote server: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to delete remote model:", error);
      throw error;
    }
  }

  async *generateStream(request: OllamaGenerateRequest): AsyncGenerator<OllamaGenerateChunk> {
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Remote Ollama generate error: ${response.statusText}`);
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
      console.error("Remote Ollama stream error:", error);
      if (error instanceof Error && (error.message.includes("fetch failed") || error.message.includes("network"))) {
        throw new Error(`Network error while streaming from remote Ollama: ${error.message}`);
      }
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
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to show model on remote server: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to show remote model:", error);
      throw error;
    }
  }

  async *streamChat(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
  }): AsyncGenerator<OllamaGenerateChunk> {
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured');
    }

    // Convert chat messages to a single prompt
    const prompt = params.messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Use generateStream with the chat prompt
    yield* this.generateStream({
      model: params.model,
      prompt: prompt,
      temperature: params.temperature,
      top_p: params.top_p,
      top_k: params.top_k,
      num_predict: params.max_tokens,
    });
  }

  async generateEmbedding(text: string, modelName: string = "nomic-embed-text"): Promise<number[]> {
    if (!this.baseUrl) {
      throw new Error('Remote Ollama URL not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          prompt: text,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout for embeddings
      });

      if (!response.ok) {
        throw new Error(`Remote Ollama embedding error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.error("Failed to generate embedding from remote Ollama:", error);
      if (error instanceof Error && (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))) {
        throw new Error(`Cannot connect to remote Ollama server for embeddings at ${this.baseUrl}`);
      }
      throw error;
    }
  }
}

export const remoteOllamaService = new RemoteOllamaService();
