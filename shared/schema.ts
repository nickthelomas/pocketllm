import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (existing)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Conversations table
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  userId: varchar("user_id").references(() => users.id),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  turnCount: integer("turn_count").default(0).notNull(), // Track conversation turns for auto-summarization
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  role: text("role").notNull(), // "user", "assistant", "system"
  content: text("content").notNull(),
  model: text("model"),
  citations: jsonb("citations"), // Array of RAG citations
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// RAG Documents table
export const ragDocuments = pgTable("rag_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  content: text("content").notNull(),
  chunksCount: integer("chunks_count").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// RAG Chunks table
export const ragChunks = pgTable("rag_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => ragDocuments.id).notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding"), // Vector embedding as JSON array
  chunkIndex: integer("chunk_index").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Models table - Supports local, remote, and cloud providers
export const models = pgTable("models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  provider: text("provider").notNull(), // "ollama" | "huggingface" | "local-file" | "openrouter" | "remote-ollama"
  isAvailable: boolean("is_available").default(true).notNull(),
  parameters: jsonb("parameters"), // Default parameters for this model
  pricing: jsonb("pricing"), // { prompt: number, completion: number } per 1M tokens (for cloud models)
  contextLength: integer("context_length"), // Maximum context window
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Settings table
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// MCP Servers table
export const mcpServers = pgTable("mcp_servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  endpoint: text("endpoint").notNull(),
  description: text("description"),
  tools: jsonb("tools"), // Array of available tools
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversation Summaries table for hierarchical memory
export const conversationSummaries = pgTable("conversation_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  tier: integer("tier").notNull(), // 1 = message-level summary, 2 = summary of summaries
  content: text("content").notNull(),
  messageRangeStart: integer("message_range_start").notNull(), // First message index covered
  messageRangeEnd: integer("message_range_end").notNull(), // Last message index covered
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tags: z.array(z.string()).optional(),
  isFavorite: z.boolean().optional(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertRagDocumentSchema = createInsertSchema(ragDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const insertRagChunkSchema = createInsertSchema(ragChunks).omit({
  id: true,
  createdAt: true,
});

export const insertModelSchema = createInsertSchema(models).omit({
  id: true,
  createdAt: true,
}).extend({
  provider: z.enum(["ollama", "local-file"]), // Enforce local-only providers
  isAvailable: z.boolean().default(true),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export const insertMcpServerSchema = createInsertSchema(mcpServers).omit({
  id: true,
  createdAt: true,
});

export const insertConversationSummarySchema = createInsertSchema(conversationSummaries).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type RagDocument = typeof ragDocuments.$inferSelect;
export type InsertRagDocument = z.infer<typeof insertRagDocumentSchema>;

export type RagChunk = typeof ragChunks.$inferSelect;
export type InsertRagChunk = z.infer<typeof insertRagChunkSchema>;

export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;

export type McpServer = typeof mcpServers.$inferSelect;
export type InsertMcpServer = z.infer<typeof insertMcpServerSchema>;

export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type InsertConversationSummary = z.infer<typeof insertConversationSummarySchema>;
