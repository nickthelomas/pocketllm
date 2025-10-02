export interface StreamingMessage {
  token?: string;
  fullResponse?: string;
  error?: string;
}

export class StreamingClient {
  private controller: AbortController | null = null;

  async streamChat(
    message: string,
    conversationId: string,
    model: string,
    options: {
      onToken?: (token: string) => void;
      onComplete?: (fullResponse: string) => void;
      onError?: (error: string) => void;
    } = {}
  ) {
    this.controller = new AbortController();

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          conversationId,
          model,
          context: [],
          ragSources: [],
          settings: {},
        }),
        signal: this.controller.signal,
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              return;
            }

            try {
              const parsed: StreamingMessage = JSON.parse(data);
              
              if (parsed.error) {
                options.onError?.(parsed.error);
                return;
              }

              if (parsed.token) {
                options.onToken?.(parsed.token);
              }

              if (parsed.fullResponse) {
                options.onComplete?.(parsed.fullResponse);
              }
            } catch (e) {
              // Ignore parsing errors for incomplete JSON
            }
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Streaming aborted");
      } else {
        console.error("Streaming error:", error);
        options.onError?.(error.message);
      }
    }
  }

  abort() {
    this.controller?.abort();
  }
}
