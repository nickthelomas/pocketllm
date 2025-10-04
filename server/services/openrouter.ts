// OpenRouter Service - Wrapper for OpenRouter Cloud API
// Provides integration with OpenRouter for cloud-based LLM inference
// Documentation: https://openrouter.ai/docs

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture?: {
    tokenizer?: string;
    instruct_type?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenRouterStreamChunk {
  id: string;
  model: string;
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}

export class OpenRouterService {
  private baseUrl: string = "https://openrouter.ai/api/v1";
  private apiKey: string | null = null;

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  async fetchOpenRouterModels(): Promise<Array<{
    name: string;
    provider: string;
    pricing: { prompt: string; completion: string };
    contextLength: number;
  }>> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(`OpenRouter models fetch failed: ${response.statusText}`);
        return [];
      }

      const data: OpenRouterModelsResponse = await response.json();
      
      return data.data.map((model) => ({
        name: model.id,
        provider: "openrouter",
        pricing: {
          prompt: model.pricing.prompt,
          completion: model.pricing.completion,
        },
        contextLength: model.context_length,
      }));
    } catch (error) {
      console.error("Failed to fetch OpenRouter models:", error);
      return [];
    }
  }

  async *streamOpenRouterChat(params: {
    model: string;
    messages: OpenRouterChatMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  }): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key not configured. Please set it in Settings.");
    }

    try {
      const requestBody: OpenRouterChatRequest = {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        top_p: params.top_p,
        max_tokens: params.max_tokens,
        stream: true,
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://pocketllm.app",
          "X-Title": "PocketLLM",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body received from OpenRouter");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

          if (trimmedLine.startsWith("data: ")) {
            try {
              const jsonStr = trimmedLine.slice(6);
              const chunk: OpenRouterStreamChunk = JSON.parse(jsonStr);
              
              if (chunk.choices?.[0]?.delta?.content) {
                yield chunk.choices[0].delta.content;
              }
            } catch (e) {
              console.error("Failed to parse OpenRouter stream chunk:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("OpenRouter stream error:", error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Unknown error occurred during OpenRouter streaming");
    }
  }

  async generateChat(params: {
    model: string;
    messages: OpenRouterChatMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  }): Promise<string> {
    let fullResponse = "";
    for await (const chunk of this.streamOpenRouterChat(params)) {
      fullResponse += chunk;
    }
    return fullResponse;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export const openRouterService = new OpenRouterService();
