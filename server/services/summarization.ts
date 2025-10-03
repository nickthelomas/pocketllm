import { ollamaService } from "./ollama";
import type { Message, ConversationSummary } from "@shared/schema";

interface SummarizationConfig {
  model: string;
  maxTokens?: number;
}

export class SummarizationService {
  private config: SummarizationConfig;

  constructor(config: SummarizationConfig = { model: "llama3.2:3b-instruct", maxTokens: 500 }) {
    this.config = config;
  }

  async summarizeMessages(messages: Message[], config?: Partial<SummarizationConfig>): Promise<string> {
    const modelToUse = config?.model || this.config.model;
    const maxTokens = config?.maxTokens || this.config.maxTokens || 500;

    const conversationText = messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n\n");

    const prompt = `You are a helpful assistant that creates concise summaries of conversations. Your task is to summarize the following conversation in a clear, informative way that preserves the key information and context. Focus on the main topics discussed, decisions made, and important details. Keep the summary under ${maxTokens} tokens.

Conversation to summarize:
${conversationText}

Please provide a concise summary:`;

    let summary = "";
    for await (const chunk of ollamaService.generateStream({
      model: modelToUse,
      prompt,
      stream: true,
    })) {
      if (chunk.response) {
        summary += chunk.response;
      }
    }

    return summary.trim();
  }

  async summarizeSummaries(summaries: ConversationSummary[], config?: Partial<SummarizationConfig>): Promise<string> {
    const modelToUse = config?.model || this.config.model;
    const maxTokens = config?.maxTokens || this.config.maxTokens || 500;

    const summariesText = summaries
      .map((s, idx) => `Summary ${idx + 1} (messages ${s.messageRangeStart}-${s.messageRangeEnd}):\n${s.content}`)
      .join("\n\n");

    const prompt = `You are a helpful assistant that creates concise meta-summaries. You will be given multiple summaries of different parts of a conversation. Your task is to create a higher-level summary that combines the key information from all these summaries. Keep the meta-summary under ${maxTokens} tokens.

Summaries to combine:
${summariesText}

Please provide a concise meta-summary that captures the essential information:`;

    let metaSummary = "";
    for await (const chunk of ollamaService.generateStream({
      model: modelToUse,
      prompt,
      stream: true,
    })) {
      if (chunk.response) {
        metaSummary += chunk.response;
      }
    }

    return metaSummary.trim();
  }
}

export const summarizationService = new SummarizationService();
