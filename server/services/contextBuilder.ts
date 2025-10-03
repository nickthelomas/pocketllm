import type { Message, ConversationSummary } from "@shared/schema";

export interface ContextBuilderConfig {
  rawMessageCount: number;
  tokenBudget: number;
}

export interface HierarchicalContext {
  systemPrompt: string;
  tier2Summary?: string;
  tier1Summaries: string[];
  recentMessages: Message[];
  fullContext: string;
}

export class ContextBuilder {
  buildHierarchicalContext(
    messages: Message[],
    summaries: ConversationSummary[],
    systemPrompt: string,
    config: ContextBuilderConfig
  ): HierarchicalContext {
    const tier1Summaries = summaries.filter(s => s.tier === 1).sort((a, b) => a.messageRangeStart - b.messageRangeStart);
    const tier2Summaries = summaries.filter(s => s.tier === 2).sort((a, b) => a.messageRangeStart - b.messageRangeStart);

    const recentMessages = messages.slice(-config.rawMessageCount);

    const tier2Summary = tier2Summaries.length > 0 
      ? tier2Summaries[tier2Summaries.length - 1].content
      : undefined;

    const tier1SummaryTexts = tier1Summaries.map(s => s.content);

    const fullContext = this.assembleContext(
      systemPrompt,
      tier2Summary,
      tier1SummaryTexts,
      recentMessages,
      config.tokenBudget
    );

    return {
      systemPrompt,
      tier2Summary,
      tier1Summaries: tier1SummaryTexts,
      recentMessages,
      fullContext,
    };
  }

  private assembleContext(
    systemPrompt: string,
    tier2Summary: string | undefined,
    tier1Summaries: string[],
    recentMessages: Message[],
    tokenBudget: number
  ): string {
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(`System: ${systemPrompt}`);
    }

    if (tier2Summary) {
      parts.push(`\n# Conversation Overview (High-Level Summary)\n${tier2Summary}`);
    }

    if (tier1Summaries.length > 0) {
      const tier1Text = tier1Summaries.map((summary, idx) => 
        `## Summary ${idx + 1}\n${summary}`
      ).join("\n\n");
      parts.push(`\n# Key Discussion Points\n${tier1Text}`);
    }

    if (recentMessages.length > 0) {
      const recentText = recentMessages.map(msg => 
        `${msg.role}: ${msg.content}`
      ).join("\n\n");
      parts.push(`\n# Recent Messages\n${recentText}`);
    }

    let fullContext = parts.join("\n\n");

    if (this.estimateTokens(fullContext) > tokenBudget) {
      fullContext = this.truncateToFitBudget(systemPrompt, tier2Summary, tier1Summaries, recentMessages, tokenBudget);
    }

    return fullContext;
  }

  private truncateToFitBudget(
    systemPrompt: string,
    tier2Summary: string | undefined,
    tier1Summaries: string[],
    recentMessages: Message[],
    tokenBudget: number
  ): string {
    const parts: string[] = [];
    let currentTokens = 0;

    if (systemPrompt) {
      const systemText = `System: ${systemPrompt}`;
      const systemTokens = this.estimateTokens(systemText);
      parts.push(systemText);
      currentTokens += systemTokens;
    }

    const recentText = recentMessages.map(msg => `${msg.role}: ${msg.content}`).join("\n\n");
    const recentTokens = this.estimateTokens(recentText);
    parts.push(`# Recent Messages\n${recentText}`);
    currentTokens += recentTokens;

    const remainingBudget = tokenBudget - currentTokens;

    if (remainingBudget > 0) {
      if (tier2Summary && this.estimateTokens(tier2Summary) < remainingBudget * 0.3) {
        parts.splice(1, 0, `# Conversation Overview\n${tier2Summary}`);
        currentTokens += this.estimateTokens(tier2Summary);
      } else if (tier1Summaries.length > 0) {
        const tier1Budget = remainingBudget * 0.5;
        const tier1Text = this.fitSummariesToBudget(tier1Summaries, tier1Budget);
        if (tier1Text) {
          parts.splice(1, 0, `# Key Discussion Points\n${tier1Text}`);
        }
      }
    }

    return parts.join("\n\n");
  }

  private fitSummariesToBudget(summaries: string[], budget: number): string | null {
    let result = "";
    let currentTokens = 0;

    for (let i = summaries.length - 1; i >= 0; i--) {
      const summaryTokens = this.estimateTokens(summaries[i]);
      if (currentTokens + summaryTokens <= budget) {
        result = summaries[i] + (result ? "\n\n" + result : "");
        currentTokens += summaryTokens;
      } else {
        break;
      }
    }

    return result || null;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
}

export const contextBuilder = new ContextBuilder();
