import { type User, type InsertUser, type Conversation, type InsertConversation, type Message, type InsertMessage, type RagDocument, type InsertRagDocument, type RagChunk, type InsertRagChunk, type Model, type InsertModel, type Settings, type InsertSettings, type McpServer, type InsertMcpServer, type ConversationSummary, type InsertConversationSummary } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Conversations
  getConversations(userId?: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<boolean>;

  // Messages
  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessages(conversationId: string): Promise<boolean>;

  // Conversation Summaries
  getSummaries(conversationId: string): Promise<ConversationSummary[]>;
  getSummariesByTier(conversationId: string, tier: number): Promise<ConversationSummary[]>;
  createSummary(summary: InsertConversationSummary): Promise<ConversationSummary>;
  deleteSummaries(conversationId: string): Promise<boolean>;

  // RAG Documents
  getRagDocuments(): Promise<RagDocument[]>;
  getRagDocument(id: string): Promise<RagDocument | undefined>;
  createRagDocument(document: InsertRagDocument): Promise<RagDocument>;
  updateRagDocument(id: string, updates: Partial<RagDocument>): Promise<RagDocument | undefined>;
  deleteRagDocument(id: string): Promise<boolean>;

  // RAG Chunks
  getRagChunks(documentId: string): Promise<RagChunk[]>;
  createRagChunk(chunk: InsertRagChunk): Promise<RagChunk>;
  searchSimilarChunks(embedding: number[], topK: number, threshold: number): Promise<RagChunk[]>;
  deleteRagChunks(documentId: string): Promise<boolean>;

  // Models
  getModels(): Promise<Model[]>;
  getModel(name: string): Promise<Model | undefined>;
  createModel(model: InsertModel): Promise<Model>;
  updateModel(id: string, updates: Partial<Model>): Promise<Model | undefined>;
  deleteModel(id: string): Promise<boolean>;

  // Settings
  getSettings(userId?: string): Promise<Settings[]>;
  getSetting(userId: string | undefined, key: string): Promise<Settings | undefined>;
  setSetting(setting: InsertSettings): Promise<Settings>;

  // MCP Servers
  getMcpServers(): Promise<McpServer[]>;
  getMcpServer(id: string): Promise<McpServer | undefined>;
  createMcpServer(server: InsertMcpServer): Promise<McpServer>;
  updateMcpServer(id: string, updates: Partial<McpServer>): Promise<McpServer | undefined>;
  deleteMcpServer(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private messages: Map<string, Message> = new Map();
  private ragDocuments: Map<string, RagDocument> = new Map();
  private ragChunks: Map<string, RagChunk> = new Map();
  private models: Map<string, Model> = new Map();
  private settings: Map<string, Settings> = new Map();
  private mcpServers: Map<string, McpServer> = new Map();
  private conversationSummaries: Map<string, ConversationSummary> = new Map();

  constructor() {
    // Initialize with default local-only models (Ollama) - optimized for mobile
    const defaultModels: InsertModel[] = [
      { name: "llama3.2:1b", provider: "ollama", isAvailable: true, parameters: { size: 1300000000 } },
      { name: "qwen2:1.5b", provider: "ollama", isAvailable: true, parameters: { size: 900000000 } },
      { name: "gemma:2b", provider: "ollama", isAvailable: true, parameters: { size: 1400000000 } },
    ];

    defaultModels.forEach(model => {
      const id = randomUUID();
      const fullModel: Model = { ...model, id, createdAt: new Date(), isAvailable: model.isAvailable, parameters: model.parameters ?? null };
      this.models.set(id, fullModel);
    });

    // Initialize with default settings for Termux/offline use
    const now = new Date();
    const defaultSettings: Settings[] = [
      { id: randomUUID(), userId: null, key: "baseApiUrl", value: "http://127.0.0.1:11434", updatedAt: now },
      { id: randomUUID(), userId: null, key: "temperature", value: "0.7", updatedAt: now },
      { id: randomUUID(), userId: null, key: "topP", value: "0.9", updatedAt: now },
      { id: randomUUID(), userId: null, key: "topK", value: "40", updatedAt: now },
      { id: randomUUID(), userId: null, key: "maxTokens", value: "2048", updatedAt: now },
      { id: randomUUID(), userId: null, key: "rawMessageCount", value: "10", updatedAt: now },
      { id: randomUUID(), userId: null, key: "summaryFrequency", value: "10", updatedAt: now },
      { id: randomUUID(), userId: null, key: "tokenBudget", value: "4000", updatedAt: now },
      { id: randomUUID(), userId: null, key: "chunkSize", value: "512", updatedAt: now },
      { id: randomUUID(), userId: null, key: "ragTopK", value: "5", updatedAt: now },
      { id: randomUUID(), userId: null, key: "cloud_models_password_enabled", value: "false", updatedAt: now },
      { id: randomUUID(), userId: null, key: "cloud_models_password", value: "", updatedAt: now }
    ];

    defaultSettings.forEach(setting => {
      const key = `${setting.userId || 'null'}_${setting.key}`;
      this.settings.set(key, setting);
    });
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Conversations
  async getConversations(userId?: string): Promise<Conversation[]> {
    const allConversations = Array.from(this.conversations.values());
    if (userId) {
      return allConversations.filter(conv => conv.userId === userId);
    }
    return allConversations;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date();
    const conversation: Conversation = {
      ...insertConversation,
      userId: insertConversation.userId ?? null,
      tags: insertConversation.tags ?? [],
      isFavorite: insertConversation.isFavorite ?? false,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    
    const updated: Conversation = { ...conversation, ...updates, updatedAt: new Date() };
    this.conversations.set(id, updated);
    return updated;
  }

  async deleteConversation(id: string): Promise<boolean> {
    // Also delete all messages in this conversation
    const messages = Array.from(this.messages.values()).filter(msg => msg.conversationId === id);
    messages.forEach(msg => this.messages.delete(msg.id));
    
    return this.conversations.delete(id);
  }

  // Messages
  async getMessages(conversationId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(msg => msg.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      model: insertMessage.model ?? null,
      citations: insertMessage.citations ?? null,
      id,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async deleteMessages(conversationId: string): Promise<boolean> {
    const messages = Array.from(this.messages.values()).filter(msg => msg.conversationId === conversationId);
    messages.forEach(msg => this.messages.delete(msg.id));
    return true;
  }

  // Conversation Summaries
  async getSummaries(conversationId: string): Promise<ConversationSummary[]> {
    return Array.from(this.conversationSummaries.values())
      .filter(summary => summary.conversationId === conversationId)
      .sort((a, b) => a.messageRangeStart - b.messageRangeStart);
  }

  async getSummariesByTier(conversationId: string, tier: number): Promise<ConversationSummary[]> {
    return Array.from(this.conversationSummaries.values())
      .filter(summary => summary.conversationId === conversationId && summary.tier === tier)
      .sort((a, b) => a.messageRangeStart - b.messageRangeStart);
  }

  async createSummary(summary: InsertConversationSummary): Promise<ConversationSummary> {
    const id = randomUUID();
    const newSummary: ConversationSummary = {
      ...summary,
      id,
      createdAt: new Date(),
    };
    this.conversationSummaries.set(id, newSummary);
    return newSummary;
  }

  async deleteSummaries(conversationId: string): Promise<boolean> {
    const summaries = Array.from(this.conversationSummaries.values())
      .filter(summary => summary.conversationId === conversationId);
    summaries.forEach(summary => this.conversationSummaries.delete(summary.id));
    return true;
  }

  // RAG Documents
  async getRagDocuments(): Promise<RagDocument[]> {
    return Array.from(this.ragDocuments.values()).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async getRagDocument(id: string): Promise<RagDocument | undefined> {
    return this.ragDocuments.get(id);
  }

  async createRagDocument(insertDocument: InsertRagDocument): Promise<RagDocument> {
    const id = randomUUID();
    const document: RagDocument = {
      ...insertDocument,
      id,
      uploadedAt: new Date(),
    };
    this.ragDocuments.set(id, document);
    return document;
  }

  async updateRagDocument(id: string, updates: Partial<RagDocument>): Promise<RagDocument | undefined> {
    const document = this.ragDocuments.get(id);
    if (!document) return undefined;
    
    const updated: RagDocument = { ...document, ...updates };
    this.ragDocuments.set(id, updated);
    return updated;
  }

  async deleteRagDocument(id: string): Promise<boolean> {
    // Also delete all chunks for this document
    await this.deleteRagChunks(id);
    return this.ragDocuments.delete(id);
  }

  // RAG Chunks
  async getRagChunks(documentId: string): Promise<RagChunk[]> {
    return Array.from(this.ragChunks.values())
      .filter(chunk => chunk.documentId === documentId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async createRagChunk(insertChunk: InsertRagChunk): Promise<RagChunk> {
    const id = randomUUID();
    const chunk: RagChunk = {
      ...insertChunk,
      embedding: insertChunk.embedding ?? null,
      id,
      createdAt: new Date(),
    };
    this.ragChunks.set(id, chunk);
    return chunk;
  }

  async searchSimilarChunks(embedding: number[], topK: number, threshold: number): Promise<RagChunk[]> {
    const chunks = Array.from(this.ragChunks.values()).filter(chunk => chunk.embedding);
    
    const similarities = chunks.map(chunk => {
      const chunkEmbedding = chunk.embedding as number[];
      const similarity = this.cosineSimilarity(embedding, chunkEmbedding);
      return { chunk, similarity };
    }).filter(({ similarity }) => similarity >= threshold);

    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK).map(({ chunk }) => chunk);
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
    const chunks = Array.from(this.ragChunks.values()).filter(chunk => chunk.documentId === documentId);
    chunks.forEach(chunk => this.ragChunks.delete(chunk.id));
    return true;
  }

  // Models
  async getModels(): Promise<Model[]> {
    return Array.from(this.models.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getModel(name: string): Promise<Model | undefined> {
    return Array.from(this.models.values()).find(model => model.name === name);
  }

  async createModel(insertModel: InsertModel): Promise<Model> {
    const id = randomUUID();
    const model: Model = {
      ...insertModel,
      isAvailable: insertModel.isAvailable,
      parameters: insertModel.parameters ?? null,
      id,
      createdAt: new Date(),
    };
    this.models.set(id, model);
    return model;
  }

  async updateModel(id: string, updates: Partial<Model>): Promise<Model | undefined> {
    const model = this.models.get(id);
    if (!model) return undefined;
    
    const updated: Model = { ...model, ...updates };
    this.models.set(id, updated);
    return updated;
  }

  async deleteModel(id: string): Promise<boolean> {
    return this.models.delete(id);
  }

  // Settings
  async getSettings(userId?: string): Promise<Settings[]> {
    const allSettings = Array.from(this.settings.values());
    if (userId) {
      return allSettings.filter(setting => setting.userId === userId);
    }
    return allSettings;
  }

  async getSetting(userId: string | null | undefined, key: string): Promise<Settings | undefined> {
    const normalizedUserId = userId === undefined ? null : userId;
    return Array.from(this.settings.values()).find(setting => 
      setting.userId === normalizedUserId && setting.key === key
    );
  }

  async setSetting(insertSetting: InsertSettings): Promise<Settings> {
    // Check if setting already exists
    const existing = await this.getSetting(insertSetting.userId, insertSetting.key);
    
    if (existing) {
      const updated: Settings = {
        ...existing,
        value: insertSetting.value,
        updatedAt: new Date(),
      };
      this.settings.set(existing.id, updated);
      return updated;
    } else {
      const id = randomUUID();
      const setting: Settings = {
        ...insertSetting,
        userId: insertSetting.userId ?? null,
        id,
        updatedAt: new Date(),
      };
      this.settings.set(id, setting);
      return setting;
    }
  }

  // MCP Servers
  async getMcpServers(): Promise<McpServer[]> {
    return Array.from(this.mcpServers.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getMcpServer(id: string): Promise<McpServer | undefined> {
    return this.mcpServers.get(id);
  }

  async createMcpServer(insertServer: InsertMcpServer): Promise<McpServer> {
    const id = randomUUID();
    const server: McpServer = {
      ...insertServer,
      description: insertServer.description ?? null,
      tools: insertServer.tools ?? null,
      isActive: insertServer.isActive ?? null,
      id,
      createdAt: new Date(),
    };
    this.mcpServers.set(id, server);
    return server;
  }

  async updateMcpServer(id: string, updates: Partial<McpServer>): Promise<McpServer | undefined> {
    const server = this.mcpServers.get(id);
    if (!server) return undefined;
    
    const updated: McpServer = { ...server, ...updates };
    this.mcpServers.set(id, updated);
    return updated;
  }

  async deleteMcpServer(id: string): Promise<boolean> {
    return this.mcpServers.delete(id);
  }
}

export const storage = new MemStorage();
