import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { dbStorage as storage } from "./dbStorage";
import { insertConversationSchema, insertMessageSchema, insertRagDocumentSchema, insertModelSchema, insertSettingsSchema, insertMcpServerSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { ollamaService } from "./services/ollama";
import { modelDirectoryScanner } from "./services/modelDirectory";

// File upload configuration
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get("/api/health", async (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Conversations
  app.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const data = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(data);
      res.json(conversation);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const conversation = await storage.updateConversation(id, updates);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteConversation(id);
      if (!success) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.delete("/api/conversations/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteMessages(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete messages" });
    }
  });

  // Conversation Metadata
  app.patch("/api/conversations/:id/title", async (req, res) => {
    try {
      const { id } = req.params;
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: "Title is required" });
      }
      const conversation = await storage.updateConversation(id, { title });
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Failed to update title" });
    }
  });

  app.patch("/api/conversations/:id/tags", async (req, res) => {
    try {
      const { id } = req.params;
      const { tags } = req.body;
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: "Tags must be an array" });
      }
      const conversation = await storage.updateConversation(id, { tags });
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Failed to update tags" });
    }
  });

  app.patch("/api/conversations/:id/favorite", async (req, res) => {
    try {
      const { id } = req.params;
      const { isFavorite } = req.body;
      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ error: "isFavorite must be a boolean" });
      }
      const conversation = await storage.updateConversation(id, { isFavorite });
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Failed to update favorite status" });
    }
  });

  // Messages
  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getMessages(id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const data = insertMessageSchema.parse({ ...req.body, conversationId: id });
      const message = await storage.createMessage(data);
      res.json(message);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Streaming chat endpoint - LOCAL ONLY using Ollama
  app.post("/api/chat/stream", async (req, res) => {
    try {
      const { message, conversationId, model, context, ragSources: providedRagSources, settings } = req.body;
      
      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      });

      // Save user message
      await storage.createMessage({
        conversationId,
        role: "user",
        content: message,
      });

      // Auto-generate title from first message
      const existingMessages = await storage.getMessages(conversationId);
      if (existingMessages.length === 1) {
        // This is the first message, generate title
        const title = message.slice(0, 60).trim() + (message.length > 60 ? '...' : '');
        await storage.updateConversation(conversationId, { title });
      }

      // Automatically retrieve RAG sources if not provided
      let ragSources = providedRagSources;
      if (!ragSources || ragSources.length === 0) {
        const ragEnabled = await storage.getSetting(undefined, "ragEnabled");
        const ragTopK = await storage.getSetting(undefined, "ragTopK");
        const ragThreshold = await storage.getSetting(undefined, "ragThreshold");
        
        if (ragEnabled?.value !== false) {
          try {
            const { embeddingService } = await import("./services/embeddings");
            const queryEmbedding = await embeddingService.generateEmbedding(message);
            const topK = ragTopK?.value ? parseInt(String(ragTopK.value)) : 5;
            const threshold = ragThreshold?.value ? parseFloat(String(ragThreshold.value)) : 0.3;
            
            const relevantChunks = await storage.searchSimilarChunks(queryEmbedding, topK, threshold);
            ragSources = relevantChunks.map(chunk => ({
              content: chunk.content,
              documentId: chunk.documentId,
              chunkIndex: chunk.chunkIndex,
            }));
          } catch (error) {
            console.warn("RAG retrieval failed:", error);
            ragSources = [];
          }
        } else {
          ragSources = [];
        }
      }

      // Build system prompt with user profile and RAG context
      const userProfile = await storage.getSetting(undefined, "userProfile");
      let systemPrompt = "";
      if (userProfile) {
        systemPrompt += `User Profile:\n${userProfile.value}\n\n`;
      }
      if (ragSources && Array.isArray(ragSources) && ragSources.length > 0) {
        systemPrompt += "Relevant context from documents:\n" + ragSources.map((source: any, idx: number) => 
          `[Document ${idx + 1}] ${source.content}`
        ).join("\n\n") + "\n\n";
      }

      // Stream response from Ollama
      let fullResponse = "";
      const modelName = model || "llama3.2:3b-instruct";
      
      try {
        for await (const chunk of ollamaService.generateStream({
          model: modelName,
          prompt: message,
          system: systemPrompt || undefined,
          temperature: settings?.temperature ?? 0.7,
          top_p: settings?.topP ?? 0.9,
          top_k: settings?.topK ?? 40,
          num_predict: settings?.maxTokens ?? 2000,
          seed: settings?.seed ?? undefined,
          context: context ?? undefined,
        })) {
          const token = chunk.response;
          fullResponse += token;
          
          res.write(`data: ${JSON.stringify({ token, fullResponse })}\n\n`);
        }
      } catch (ollamaError) {
        console.error("Ollama error:", ollamaError);
        
        const errorMessage = "⚠️ **Ollama Not Available**\n\nThe local Ollama server is not running. This app requires a local Ollama instance for LLM inference.\n\n**To fix this:**\n1. Install Ollama from https://ollama.ai\n2. Start Ollama: `ollama serve`\n3. Pull a model: `ollama pull llama3.2:3b-instruct`\n4. Refresh this page\n\n**Note:** This is a strictly local-only LLM app with zero cloud dependencies. All inference happens on your device.";
        
        fullResponse = errorMessage;
        res.write(`data: ${JSON.stringify({ token: errorMessage, fullResponse: errorMessage })}\n\n`);
      }

      // Save assistant message
      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: fullResponse,
        model: modelName,
        citations: ragSources || null,
      });

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error) {
      console.error("Streaming error:", error);
      res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`);
      res.end();
    }
  });

  // Models - LOCAL ONLY (Ollama + local directory)
  app.get("/api/models", async (req, res) => {
    try {
      const models = await storage.getModels();
      res.json(models);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  app.get("/api/models/sync", async (req, res) => {
    try {
      // Sync models from Ollama
      const ollamaAvailable = await ollamaService.isAvailable();
      if (ollamaAvailable) {
        const ollamaModels = await ollamaService.listModels();
        for (const ollamaModel of ollamaModels) {
          const existing = await storage.getModel(ollamaModel.name);
          if (!existing) {
            await storage.createModel({
              name: ollamaModel.name,
              provider: "ollama",
              isAvailable: true,
              parameters: null,
            });
          }
        }
      }

      // Sync models from local directory
      const localModels = await modelDirectoryScanner.scanModels();
      for (const localModel of localModels) {
        const existing = await storage.getModel(localModel.name);
        if (!existing) {
          await storage.createModel({
            name: localModel.name,
            provider: "local-file",
            isAvailable: true,
            parameters: { path: localModel.path },
          });
        }
      }

      const models = await storage.getModels();
      res.json({ synced: true, models });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/models/pull", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Model name is required" });
      }

      // Set up SSE for pull progress
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      await ollamaService.pullModel(name, (progress, status) => {
        res.write(`data: ${JSON.stringify({ progress, status })}\n\n`);
      });

      // Add model to storage
      await storage.createModel({
        name,
        provider: "ollama",
        isAvailable: true,
        parameters: null,
      });

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`);
      res.end();
    }
  });

  app.post("/api/models", async (req, res) => {
    try {
      const data = insertModelSchema.parse(req.body);
      const model = await storage.createModel(data);
      res.json(model);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/models/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const model = await storage.updateModel(id, updates);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // RAG Documents
  app.get("/api/rag/documents", async (req, res) => {
    try {
      const documents = await storage.getRagDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.delete("/api/rag/documents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      await storage.deleteRagChunks(id);
      const success = await storage.deleteRagDocument(id);
      
      if (!success) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete document error:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.post("/api/rag/upload", upload.single("file"), async (req: Request, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, mimetype, size, buffer } = req.file;
      
      // Extract text content based on file type
      let content = "";
      
      if (mimetype === "application/pdf") {
        // Parse PDF - pdf-parse only works with CommonJS so we use createRequire
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(buffer);
        content = pdfData.text;
      } else if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        // Parse DOCX
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } else if (mimetype === "text/plain") {
        content = buffer.toString("utf-8");
      } else if (mimetype === "application/json") {
        content = buffer.toString("utf-8");
      } else if (mimetype === "text/csv") {
        content = buffer.toString("utf-8");
      } else {
        return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
      }

      // Create document
      const document = await storage.createRagDocument({
        fileName: originalname,
        fileType: mimetype,
        fileSize: size,
        content,
        chunksCount: 0, // Will be updated after chunking
      });

      // Split into chunks (simplified chunking - in production use proper text splitters)
      const chunkSize = 512;
      const chunks = [];
      const words = content.split(' ');
      
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkContent = words.slice(i, i + chunkSize).join(' ');
        if (chunkContent.trim()) {
          chunks.push(chunkContent);
        }
      }

      // Create chunks with embeddings
      const { embeddingService } = await import("./services/embeddings");
      const embeddings = await embeddingService.generateBatchEmbeddings(chunks);
      
      for (let i = 0; i < chunks.length; i++) {
        await storage.createRagChunk({
          documentId: document.id,
          content: chunks[i],
          embedding: embeddings[i],
          chunkIndex: i,
        });
      }

      // Update document with chunk count
      await storage.updateRagDocument(document.id, { chunksCount: chunks.length });

      res.json(document);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const data = insertSettingsSchema.parse(req.body);
      const setting = await storage.setSetting(data);
      res.json(setting);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // MCP Servers
  app.get("/api/mcp/servers", async (req, res) => {
    try {
      const servers = await storage.getMcpServers();
      res.json(servers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch MCP servers" });
    }
  });

  app.post("/api/mcp/servers", async (req, res) => {
    try {
      const data = insertMcpServerSchema.parse(req.body);
      const server = await storage.createMcpServer(data);
      res.json(server);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/mcp/servers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteMcpServer(id);
      if (!success) {
        return res.status(404).json({ error: "MCP server not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete MCP server" });
    }
  });

  // Export/Import
  app.get("/api/export", async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      const allMessages = await Promise.all(
        conversations.map(async (conv) => ({
          conversation: conv,
          messages: await storage.getMessages(conv.id),
        }))
      );
      const settings = await storage.getSettings();
      const ragDocuments = await storage.getRagDocuments();
      
      const exportData = {
        version: "1.1",
        exportDate: new Date().toISOString(),
        conversations: allMessages,
        settings,
        ragDocuments,
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="pocket-llm-export.json"');
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  app.post("/api/import", upload.single("file"), async (req: Request, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const importData = JSON.parse(req.file.buffer.toString("utf-8"));
      
      // Support both old format (data array) and new format (conversations, settings)
      const conversationsData = importData.conversations || importData.data;
      
      if (!conversationsData || !Array.isArray(conversationsData)) {
        return res.status(400).json({ error: "Invalid import file format" });
      }

      let importedConversations = 0;
      let importedMessages = 0;
      let importedSettings = 0;

      // Import conversations and messages
      for (const item of conversationsData) {
        const { conversation, messages } = item;
        
        // Create conversation
        const newConv = await storage.createConversation({
          title: conversation.title,
          userId: conversation.userId,
        });
        
        importedConversations++;

        // Import messages
        for (const message of messages) {
          await storage.createMessage({
            conversationId: newConv.id,
            role: message.role,
            content: message.content,
            model: message.model,
            citations: message.citations,
          });
          importedMessages++;
        }
      }

      // Import settings if present (v1.1+)
      if (importData.settings && Array.isArray(importData.settings)) {
        for (const setting of importData.settings) {
          await storage.setSetting({
            userId: setting.userId,
            key: setting.key,
            value: setting.value,
          });
          importedSettings++;
        }
      }

      res.json({
        success: true,
        importedConversations,
        importedMessages,
        importedSettings,
      });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ error: "Failed to import data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
