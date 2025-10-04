import type { IStorage } from "../storage";
import type { Message, Conversation, ConversationSummary } from "@shared/schema";
import { summarizationService } from "./summarization";

interface MemoryConfig {
  summaryFrequency: number;
  messagesPerSummary: number;
  tier1SummariesBeforeTier2: number;
  model: string;
}

const DEFAULT_CONFIG: MemoryConfig = {
  summaryFrequency: 10,
  messagesPerSummary: 10,
  tier1SummariesBeforeTier2: 5,
  model: "llama3.2:1b",
};

export class MemoryManager {
  private storage: IStorage;
  private config: MemoryConfig;

  constructor(storage: IStorage, config: Partial<MemoryConfig> = {}) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async checkAndSummarize(conversationId: string): Promise<void> {
    const conversation = await this.storage.getConversation(conversationId);
    if (!conversation) return;

    if (conversation.turnCount % this.config.summaryFrequency === 0 && conversation.turnCount > 0) {
      await this.performSummarization(conversationId);
    }
  }

  private async performSummarization(conversationId: string): Promise<void> {
    const messages = await this.storage.getMessages(conversationId);
    const existingSummaries = await this.storage.getSummaries(conversationId);

    const tier1Summaries = existingSummaries.filter(s => s.tier === 1);
    
    const lastSummarizedIndex = tier1Summaries.length > 0
      ? Math.max(...tier1Summaries.map(s => s.messageRangeEnd))
      : -1;

    const unsummarizedMessages = messages.filter((_, idx) => idx > lastSummarizedIndex);

    if (unsummarizedMessages.length >= this.config.messagesPerSummary) {
      await this.createTier1Summary(conversationId, unsummarizedMessages, lastSummarizedIndex + 1);
    }

    const updatedTier1Summaries = await this.storage.getSummariesByTier(conversationId, 1);
    if (updatedTier1Summaries.length >= this.config.tier1SummariesBeforeTier2) {
      await this.createTier2Summary(conversationId, updatedTier1Summaries);
    }
  }

  private async createTier1Summary(
    conversationId: string,
    messages: Message[],
    startIndex: number
  ): Promise<void> {
    const messagesToSummarize = messages.slice(0, this.config.messagesPerSummary);
    
    const summaryContent = await summarizationService.summarizeMessages(messagesToSummarize, {
      model: this.config.model,
    });

    await this.storage.createSummary({
      conversationId,
      tier: 1,
      content: summaryContent,
      messageRangeStart: startIndex,
      messageRangeEnd: startIndex + messagesToSummarize.length - 1,
    });
  }

  private async createTier2Summary(
    conversationId: string,
    tier1Summaries: ConversationSummary[]
  ): Promise<void> {
    const tier2Summaries = await this.storage.getSummariesByTier(conversationId, 2);
    
    const lastTier2Index = tier2Summaries.length > 0
      ? Math.max(...tier2Summaries.map(s => s.messageRangeEnd))
      : -1;

    const newTier1Summaries = tier1Summaries.filter(s => s.messageRangeEnd > lastTier2Index);

    if (newTier1Summaries.length >= this.config.tier1SummariesBeforeTier2) {
      const summariesToCombine = newTier1Summaries.slice(0, this.config.tier1SummariesBeforeTier2);
      
      const metaSummaryContent = await summarizationService.summarizeSummaries(summariesToCombine, {
        model: this.config.model,
      });

      await this.storage.createSummary({
        conversationId,
        tier: 2,
        content: metaSummaryContent,
        messageRangeStart: summariesToCombine[0].messageRangeStart,
        messageRangeEnd: summariesToCombine[summariesToCombine.length - 1].messageRangeEnd,
      });
    }
  }

  async incrementTurnCount(conversationId: string): Promise<void> {
    const conversation = await this.storage.getConversation(conversationId);
    if (!conversation) return;

    await this.storage.updateConversation(conversationId, {
      turnCount: (conversation.turnCount || 0) + 1,
    });
  }
}

export const createMemoryManager = (storage: IStorage, config?: Partial<MemoryConfig>) => {
  return new MemoryManager(storage, config);
};
