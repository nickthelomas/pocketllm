import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConversationSchema, insertMessageSchema, insertRagDocumentSchema, insertModelSchema, insertSettingsSchema, insertMcpServerSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";

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

  // Streaming chat endpoint
  app.post("/api/chat/stream", async (req, res) => {
    try {
      const { message, conversationId, model, context, ragSources, settings } = req.body;
      
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

      // Build system prompt with user profile
      const userProfile = await storage.getSetting(undefined, "userProfile");
      let systemPrompt = "";
      if (userProfile) {
        systemPrompt += `User Profile:\n${userProfile.value}\n\n`;
      }
      if (ragSources && Array.isArray(ragSources) && ragSources.length > 0) {
        systemPrompt += "Relevant context:\n" + ragSources.map((source: any) => source.content).join("\n\n") + "\n\n";
      }

      // Simulate streaming response (in real implementation, this would connect to actual LLM APIs)
      const response = "I'll help you implement RAG with local embeddings. Here's a comprehensive approach:\n\n**1. Document Processing Pipeline:**\n- Upload documents through your UI (PDF, DOCX, TXT, CSV, JSON)\n- Parse and extract text content\n- Split documents into manageable chunks (typically 500-1000 tokens)\n- Generate embeddings using a local model like all-MiniLM-L6-v2\n\n**2. Vector Storage:**\n- Store embeddings in SQLite with vector extension or Chroma\n- Index documents with metadata (filename, page, timestamp)\n- Implement similarity search using cosine similarity";

      // Stream the response token by token
      const tokens = response.split(' ');
      let fullResponse = "";
      
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i] + (i < tokens.length - 1 ? ' ' : '');
        fullResponse += token;
        
        res.write(`data: ${JSON.stringify({ token, fullResponse })}\n\n`);
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Save assistant message
      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: fullResponse,
        model: model || "llama3.2:3b-instruct",
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

  // Models
  app.get("/api/models", async (req, res) => {
    try {
      const models = await storage.getModels();
      res.json(models);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch models" });
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

  app.post("/api/rag/upload", upload.single("file"), async (req: Request, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, mimetype, size, buffer } = req.file;
      
      // Extract text content based on file type
      let content = "";
      if (mimetype === "text/plain") {
        content = buffer.toString("utf-8");
      } else if (mimetype === "application/json") {
        content = buffer.toString("utf-8");
      } else if (mimetype === "text/csv") {
        content = buffer.toString("utf-8");
      } else {
        // For PDF and DOCX, we'd need additional parsing libraries
        // For now, treat as plain text
        content = buffer.toString("utf-8");
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

      // Create chunks (embeddings would be generated here in production)
      for (let i = 0; i < chunks.length; i++) {
        await storage.createRagChunk({
          documentId: document.id,
          content: chunks[i],
          embedding: null, // In production, generate embeddings here
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

  app.delete("/api/rag/documents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteRagDocument(id);
      if (!success) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
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
      
      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        data: allMessages,
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
      
      // Validate import data structure
      if (!importData.data || !Array.isArray(importData.data)) {
        return res.status(400).json({ error: "Invalid import file format" });
      }

      let importedConversations = 0;
      let importedMessages = 0;

      for (const item of importData.data) {
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

      res.json({
        success: true,
        importedConversations,
        importedMessages,
      });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ error: "Failed to import data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
