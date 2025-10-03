import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import type { IStorage } from "./storage";
import type {
  User, InsertUser,
  Conversation, InsertConversation,
  Message, InsertMessage,
  RagDocument, InsertRagDocument,
  RagChunk, InsertRagChunk,
  Model, InsertModel,
  Settings, InsertSettings,
  McpServer, InsertMcpServer,
  ConversationSummary, InsertConversationSummary
} from "@shared/schema";
import { 
  users, conversations, messages, 
  ragDocuments, ragChunks, models, 
  settings, mcpServers, conversationSummaries 
} from "@shared/schema";

export class DbStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(data: InsertUser): Promise<User> {
    const result = await db.insert(users).values(data).returning();
    return result[0];
  }

  // Conversations
  async getConversations(userId?: string): Promise<Conversation[]> {
    if (userId) {
      return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
    }
    return db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return result[0];
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(data).returning();
    return result[0];
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const result = await db.update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return result[0];
  }

  async deleteConversation(id: string): Promise<boolean> {
    const result = await db.delete(conversations).where(eq(conversations.id, id)).returning();
    return result.length > 0;
  }

  async deleteMessages(conversationId: string): Promise<boolean> {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    return true;
  }

  // Conversation Summaries
  async getSummaries(conversationId: string): Promise<ConversationSummary[]> {
    return db.select().from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .orderBy(conversationSummaries.messageRangeStart);
  }

  async getSummariesByTier(conversationId: string, tier: number): Promise<ConversationSummary[]> {
    return db.select().from(conversationSummaries)
      .where(and(
        eq(conversationSummaries.conversationId, conversationId),
        eq(conversationSummaries.tier, tier)
      ))
      .orderBy(conversationSummaries.messageRangeStart);
  }

  async createSummary(data: InsertConversationSummary): Promise<ConversationSummary> {
    const result = await db.insert(conversationSummaries).values(data).returning();
    return result[0];
  }

  async deleteSummaries(conversationId: string): Promise<boolean> {
    await db.delete(conversationSummaries).where(eq(conversationSummaries.conversationId, conversationId));
    return true;
  }

  // Messages
  async getMessages(conversationId: string): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(data).returning();
    
    // Update conversation's updatedAt
    await db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, data.conversationId));
    
    return result[0];
  }

  // RAG Documents
  async getRagDocuments(): Promise<RagDocument[]> {
    return db.select().from(ragDocuments).orderBy(desc(ragDocuments.uploadedAt));
  }

  async getRagDocument(id: string): Promise<RagDocument | undefined> {
    const result = await db.select().from(ragDocuments).where(eq(ragDocuments.id, id)).limit(1);
    return result[0];
  }

  async createRagDocument(data: InsertRagDocument): Promise<RagDocument> {
    const result = await db.insert(ragDocuments).values(data).returning();
    return result[0];
  }

  async updateRagDocument(id: string, updates: Partial<RagDocument>): Promise<RagDocument | undefined> {
    const result = await db.update(ragDocuments)
      .set(updates)
      .where(eq(ragDocuments.id, id))
      .returning();
    return result[0];
  }

  async deleteRagDocument(id: string): Promise<boolean> {
    const result = await db.delete(ragDocuments).where(eq(ragDocuments.id, id)).returning();
    return result.length > 0;
  }

  // RAG Chunks
  async getRagChunks(documentId: string): Promise<RagChunk[]> {
    return db.select().from(ragChunks)
      .where(eq(ragChunks.documentId, documentId))
      .orderBy(ragChunks.chunkIndex);
  }

  async createRagChunk(data: InsertRagChunk): Promise<RagChunk> {
    const embeddingArray = data.embedding as number[] | null;
    
    if (!embeddingArray || embeddingArray.length !== 768) {
      throw new Error(`Invalid embedding dimension: expected 768, got ${embeddingArray?.length || 0}`);
    }
    
    const embeddingStr = `[${embeddingArray.join(',')}]`;
    
    const result = await db.execute(sql`
      INSERT INTO rag_chunks (document_id, content, embedding, embedding_vector, chunk_index, created_at)
      VALUES (
        ${data.documentId},
        ${data.content},
        ${JSON.stringify(embeddingArray)}::jsonb,
        ${embeddingStr}::vector(768),
        ${data.chunkIndex},
        NOW()
      )
      RETURNING *
    `);
    
    return result.rows[0] as RagChunk;
  }

  async searchSimilarChunks(embedding: number[], topK: number, threshold: number): Promise<RagChunk[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    
    const result = await db.execute(sql`
      SELECT *, 
             1 - (embedding_vector <=> ${embeddingStr}::vector) as similarity
      FROM ${ragChunks}
      WHERE embedding_vector IS NOT NULL
        AND 1 - (embedding_vector <=> ${embeddingStr}::vector) >= ${threshold}
      ORDER BY embedding_vector <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `);
    
    return result.rows as RagChunk[];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async deleteRagChunks(documentId: string): Promise<boolean> {
    await db.delete(ragChunks).where(eq(ragChunks.documentId, documentId));
    return true;
  }

  // Models
  async getModels(): Promise<Model[]> {
    return db.select().from(models).orderBy(models.name);
  }

  async getModel(name: string): Promise<Model | undefined> {
    const result = await db.select().from(models).where(eq(models.name, name)).limit(1);
    return result[0];
  }

  async createModel(data: InsertModel): Promise<Model> {
    const result = await db.insert(models).values(data).returning();
    return result[0];
  }

  async updateModel(id: string, updates: Partial<Model>): Promise<Model | undefined> {
    const result = await db.update(models)
      .set(updates)
      .where(eq(models.id, id))
      .returning();
    return result[0];
  }

  async deleteModel(id: string): Promise<boolean> {
    const result = await db.delete(models).where(eq(models.id, id)).returning();
    return result.length > 0;
  }

  // Settings
  async getSettings(userId?: string): Promise<Settings[]> {
    if (userId) {
      return db.select().from(settings).where(eq(settings.userId, userId));
    }
    return db.select().from(settings);
  }

  async getSetting(userId: string | undefined, key: string): Promise<Settings | undefined> {
    const query = userId
      ? and(eq(settings.userId, userId), eq(settings.key, key))
      : eq(settings.key, key);
    
    const result = await db.select().from(settings).where(query).limit(1);
    return result[0];
  }

  async setSetting(data: InsertSettings): Promise<Settings> {
    const existing = await this.getSetting(data.userId || undefined, data.key);
    
    if (existing) {
      const result = await db.update(settings)
        .set({ value: data.value, updatedAt: new Date() })
        .where(eq(settings.id, existing.id))
        .returning();
      return result[0];
    }
    
    const result = await db.insert(settings).values(data).returning();
    return result[0];
  }

  async createOrUpdateSetting(data: InsertSettings): Promise<Settings> {
    return this.setSetting(data);
  }

  async deleteSetting(id: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.id, id)).returning();
    return result.length > 0;
  }

  // MCP Servers
  async getMcpServers(): Promise<McpServer[]> {
    return db.select().from(mcpServers).orderBy(mcpServers.name);
  }

  async getMcpServer(id: string): Promise<McpServer | undefined> {
    const result = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
    return result[0];
  }

  async createMcpServer(data: InsertMcpServer): Promise<McpServer> {
    const result = await db.insert(mcpServers).values(data).returning();
    return result[0];
  }

  async updateMcpServer(id: string, updates: Partial<McpServer>): Promise<McpServer | undefined> {
    const result = await db.update(mcpServers)
      .set(updates)
      .where(eq(mcpServers.id, id))
      .returning();
    return result[0];
  }

  async deleteMcpServer(id: string): Promise<boolean> {
    const result = await db.delete(mcpServers).where(eq(mcpServers.id, id)).returning();
    return result.length > 0;
  }
}

export const dbStorage = new DbStorage();
