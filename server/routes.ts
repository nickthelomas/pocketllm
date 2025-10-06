import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storageSelector";
import { insertConversationSchema, insertMessageSchema, insertRagDocumentSchema, insertModelSchema, insertSettingsSchema, insertMcpServerSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { ollamaService } from "./services/ollama";
import { modelDirectoryScanner } from "./services/modelDirectory";
import { createMemoryManager } from "./services/memoryManager";
import { contextBuilder } from "./services/contextBuilder";
import { promises as fs } from "fs";
import path from "path";

// Helper to get Ollama service with configured base URL
async function getOllamaService() {
  const baseApiUrlSetting = await storage.getSetting(undefined, "baseApiUrl");
  const baseUrl = baseApiUrlSetting?.value ? String(baseApiUrlSetting.value) : "http://127.0.0.1:11434";
  ollamaService.setBaseUrl(baseUrl);
  return ollamaService;
}

// Map Ollama model names to HuggingFace GGUF downloads for GPU bridge
function getHuggingFaceGGUF(modelName: string): { url: string; filename: string } | null {
  const mappings: Record<string, { url: string; filename: string }> = {
    "tinyllama": {
      url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
      filename: "tinyllama.gguf"
    },
    "tinyllama:latest": {
      url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
      filename: "tinyllama.gguf"
    },
    "phi3:mini": {
      url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
      filename: "phi3-mini.gguf"
    },
    "phi3": {
      url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
      filename: "phi3-mini.gguf"
    },
    "llama3.2:1b": {
      url: "https://huggingface.co/lmstudio-community/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
      filename: "llama3.2-1b.gguf"
    },
    "llama3.2:3b": {
      url: "https://huggingface.co/lmstudio-community/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
      filename: "llama3.2-3b.gguf"
    },
    "nomic-embed-text": {
      url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf",
      filename: "nomic-embed-text.gguf"
    },
    "nomic-embed-text:latest": {
      url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf",
      filename: "nomic-embed-text.gguf"
    }
  };
  
  return mappings[modelName.toLowerCase()] || null;
}

// File upload configuration
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/x-pdf', // Alternative PDF MIME type
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword', // DOC files
      'text/plain',
      'text/csv',
      'application/json',
      'application/octet-stream' // Sometimes browsers send this for binary files
    ];
    
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.csv', '.json'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${ext})`));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get("/api/health", async (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // System health and logs endpoint
  app.get("/api/system/health", async (req, res) => {
    const health = {
      timestamp: new Date().toISOString(),
      backend: { status: "ok", message: "Backend server is running" },
      database: { status: "unknown", message: "" },
      ollama: { status: "unknown", message: "" }
    };

    // Check database connection
    try {
      await storage.getSettings();
      health.database.status = "ok";
      health.database.message = "Database connected successfully";
    } catch (err) {
      health.database.status = "error";
      health.database.message = err instanceof Error ? err.message : "Database connection failed";
    }

    // Check LLM service - provider-aware
    try {
      const ollama = await getOllamaService();
      const loadedModelName = ollama.getLoadedModel();
      console.log(`🔍 Health check - loaded model: "${loadedModelName}"`);
      
      // If a model is loaded, check its provider
      if (loadedModelName) {
        const modelInfo = await storage.getModel(loadedModelName);
        console.log(`🔍 Health check - model provider: "${modelInfo?.provider}"`);
        
        if (modelInfo?.provider === "openrouter") {
          // Cloud model - check if API key is configured
          const apiKeySetting = await storage.getSetting(undefined, "openrouter_api_key");
          const apiKey = apiKeySetting?.value ? String(apiKeySetting.value) : "";
          
          if (apiKey && apiKey.trim()) {
            health.ollama.status = "ok";
            health.ollama.message = `OpenRouter cloud model active: ${loadedModelName}`;
          } else {
            health.ollama.status = "error";
            health.ollama.message = "OpenRouter API key not configured";
          }
        } else if (modelInfo?.provider === "remote-ollama") {
          // Remote model - check if remote URL is configured
          const remoteUrlSetting = await storage.getSetting(undefined, "remote_ollama_url");
          const remoteUrl = remoteUrlSetting?.value ? String(remoteUrlSetting.value) : "";
          
          if (remoteUrl && remoteUrl.trim()) {
            health.ollama.status = "ok";
            health.ollama.message = `Remote Ollama model active: ${loadedModelName}`;
          } else {
            health.ollama.status = "error";
            health.ollama.message = "Remote Ollama URL not configured";
          }
        } else {
          // Local model (ollama, huggingface, local-file) - check local Ollama
          const isOnline = await ollama.isAvailable();
          
          if (!isOnline) {
            health.ollama.status = "error";
            health.ollama.message = "Ollama server not responding";
          } else {
            const models = await ollama.listModels();
            const modelExists = models.some(m => m.name === loadedModelName);
            
            if (modelExists) {
              health.ollama.status = "ok";
              health.ollama.message = `Ollama connected - ${models.length} models available - Active: ${loadedModelName}`;
            } else {
              health.ollama.status = "error";
              health.ollama.message = `Model "${loadedModelName}" failed to load or not found`;
            }
          }
        }
      } else {
        // No model loaded - check if Ollama is at least online
        const isOnline = await ollama.isAvailable();
        
        if (!isOnline) {
          health.ollama.status = "error";
          health.ollama.message = "Ollama server not responding";
        } else {
          const models = await ollama.listModels();
          health.ollama.status = "warning";
          health.ollama.message = `Ollama connected - ${models.length} models available - No model loaded yet`;
        }
      }
    } catch (err) {
      health.ollama.status = "error";
      health.ollama.message = err instanceof Error ? err.message : "LLM service check failed";
    }

    res.json(health);
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

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const data = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(data);
      res.json(conversation);
    } catch (error) {
      console.error("Conversation creation error:", error);
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      res.status(400).json({ error: errorMessage });
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

  // Helper function to clean up response artifacts
  function cleanResponse(text: string): string {
    return text
      .replace(/>\s*EOF\s+by\s+user/gi, '')  // Remove ">EOF by user" artifacts
      .replace(/>\s*EOF\s*/gi, '')            // Remove ">EOF" alone
      .trim();
  }

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

      // Get memory settings
      const rawMessageCountSetting = await storage.getSetting(undefined, "rawMessageCount");
      const tokenBudgetSetting = await storage.getSetting(undefined, "tokenBudget");
      const rawMessageCount = rawMessageCountSetting?.value ? parseInt(String(rawMessageCountSetting.value)) : 10;
      const tokenBudget = tokenBudgetSetting?.value ? parseInt(String(tokenBudgetSetting.value)) : 4000;

      // Build hierarchical context
      const allMessages = await storage.getMessages(conversationId);
      const summaries = await storage.getSummaries(conversationId);
      
      const userProfile = await storage.getSetting(undefined, "userProfile");
      let baseSystemPrompt = "";
      if (userProfile) {
        baseSystemPrompt += `User Profile:\n${userProfile.value}\n\n`;
      }
      if (ragSources && Array.isArray(ragSources) && ragSources.length > 0) {
        baseSystemPrompt += "Relevant context from documents:\n" + ragSources.map((source: any, idx: number) => 
          `[Document ${idx + 1}] ${source.content}`
        ).join("\n\n") + "\n\n";
      }

      const hierarchicalContext = contextBuilder.buildHierarchicalContext(
        allMessages,
        summaries,
        baseSystemPrompt,
        { rawMessageCount, tokenBudget }
      );

      // Determine provider from model
      const modelName = model || "llama3.2:1b";
      const modelInfo = await storage.getModel(modelName);
      const provider = modelInfo?.provider || 'ollama';
      
      let fullResponse = "";
      
      try {
        if (provider === 'openrouter') {
          // OpenRouter cloud models
          const { OpenRouterService } = await import('./services/openrouter.js');
          const openrouterService = new OpenRouterService();
          const apiKey = await storage.getSetting(undefined, 'openrouter_api_key');
          
          if (!apiKey?.value) {
            throw new Error('OpenRouter API key not configured. Please add it in Settings.');
          }
          
          openrouterService.setApiKey(apiKey.value as string);
          
          // Build messages in OpenAI format
          const messages: any[] = [];
          if (hierarchicalContext.fullContext) {
            messages.push({ role: 'system', content: hierarchicalContext.fullContext });
          }
          messages.push({ role: 'user', content: message });
          
          for await (const chunk of openrouterService.streamOpenRouterChat({
            model: modelName,
            messages,
            temperature: settings?.temperature ?? 0.7,
            max_tokens: settings?.maxTokens ?? 2000,
          })) {
            const token = chunk;
            fullResponse += token;
            res.write(`data: ${JSON.stringify({ token, fullResponse })}\n\n`);
          }
        } else if (provider === 'remote-ollama') {
          // Remote Ollama via Tailscale
          const { RemoteOllamaService } = await import('./services/remoteOllama.js');
          const remoteService = new RemoteOllamaService();
          const remoteUrl = await storage.getSetting(undefined, 'remote_ollama_url');
          
          if (!remoteUrl?.value) {
            throw new Error('Remote Ollama URL not configured. Please add it in Settings.');
          }
          
          remoteService.setBaseUrl(remoteUrl.value as string);
          
          for await (const chunk of remoteService.generateStream({
            model: modelName,
            prompt: message,
            system: hierarchicalContext.fullContext || undefined,
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
        } else {
          // Local Ollama (default)
          const ollama = await getOllamaService();
          
          for await (const chunk of ollama.generateStream({
            model: modelName,
            prompt: message,
            system: hierarchicalContext.fullContext || undefined,
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
        }
      } catch (streamError) {
        console.error("Streaming error:", streamError);
        
        let errorMessage = "";
        if (provider === 'openrouter') {
          errorMessage = "⚠️ **OpenRouter Error**\n\n" + (streamError instanceof Error ? streamError.message : String(streamError)) + "\n\nCheck your API key and network connection.";
        } else if (provider === 'remote-ollama') {
          errorMessage = "⚠️ **Remote Ollama Error**\n\n" + (streamError instanceof Error ? streamError.message : String(streamError)) + "\n\nCheck your Tailscale connection and remote server status.";
        } else {
          errorMessage = "⚠️ **Ollama Not Available**\n\nThe local Ollama server is not running.\n\n**To fix:**\n1. Install Ollama from https://ollama.ai\n2. Run: `ollama serve`\n3. Pull a model: `ollama pull llama3.2:1b`";
        }
        
        fullResponse = errorMessage;
        res.write(`data: ${JSON.stringify({ token: errorMessage, fullResponse: errorMessage })}\n\n`);
      }

      // Clean and save assistant message
      const cleanedResponse = cleanResponse(fullResponse);
      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: cleanedResponse,
        model: modelName,
        citations: ragSources || null,
      });

      // Increment turn count and check for summarization
      const summaryFrequencySetting = await storage.getSetting(undefined, "summaryFrequency");
      const summaryFrequency = summaryFrequencySetting?.value ? parseInt(String(summaryFrequencySetting.value)) : 10;
      
      const memoryManager = createMemoryManager(storage, {
        summaryFrequency,
        model: modelName,
      });
      
      await memoryManager.incrementTurnCount(conversationId);
      await memoryManager.checkAndSummarize(conversationId);

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
      const syncedModels: any[] = [];
      
      // First, mark all existing Ollama models as unavailable (we'll re-enable the ones that sync)
      const existingModels = await storage.getModels();
      const ollamaModelIds = existingModels
        .filter(m => m.provider === 'ollama')
        .map(m => m.id);
      
      for (const modelId of ollamaModelIds) {
        await storage.updateModel(modelId, { isAvailable: false });
      }
      
      // Detect GPU bridge mode by checking health endpoint
      let isGpuBridge = false;
      const ollama = await getOllamaService();
      const ollamaAvailable = await ollama.isAvailable();
      
      if (ollamaAvailable) {
        try {
          const baseUrl = ollama.getBaseUrl();
          const healthResponse = await fetch(`${baseUrl}/api/health`, {
            method: "GET",
            signal: AbortSignal.timeout(2000),
          });
          if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            isGpuBridge = healthData.gpu_enabled === true;
            console.log(`🔍 GPU bridge detection: gpu_enabled=${isGpuBridge}`);
          }
        } catch (error) {
          // Health check failed, assume standard Ollama
          console.log('Health check failed during sync, assuming standard Ollama');
        }
      }
      
      // Sync models from Ollama with configured base URL
      if (ollamaAvailable) {
        const ollamaModels = await ollama.listModels();
        console.log(`📋 Found ${ollamaModels.length} models from ${isGpuBridge ? 'GPU bridge' : 'Ollama'}`);
        
        for (const ollamaModel of ollamaModels) {
          const existing = await storage.getModel(ollamaModel.name);
          if (!existing) {
            await storage.createModel({
              name: ollamaModel.name,
              provider: "ollama",
              isAvailable: true,
              parameters: { size: ollamaModel.size, details: ollamaModel.details },
            });
            console.log(`✅ Added new model: ${ollamaModel.name}`);
          } else {
            // Re-enable the model since it was found
            await storage.updateModel(existing.id, { 
              isAvailable: true,
              parameters: { size: ollamaModel.size, details: ollamaModel.details },
            });
            console.log(`✅ Re-enabled model: ${ollamaModel.name}`);
          }
          syncedModels.push({
            name: ollamaModel.name,
            provider: "ollama",
            size: ollamaModel.size,
            details: ollamaModel.details,
          });
        }
      }

      // Sync models from local directory
      const localModels = await modelDirectoryScanner.scanModels();
      for (const localModel of localModels) {
        const existing = await storage.getModel(localModel.name);
        
        // Skip if already synced as Ollama model AND we're in GPU bridge mode
        // (GPU bridge serves local GGUF files via Ollama API, causing duplicates)
        // In standard Ollama mode, allow both providers to coexist (user may have local copies)
        if (isGpuBridge && existing && existing.provider === "ollama") {
          console.log(`⏭️  Skipping ${localModel.name} - already synced via GPU bridge`);
          continue;
        }
        
        if (!existing) {
          await storage.createModel({
            name: localModel.name,
            provider: "local-file",
            isAvailable: true,
            parameters: { path: localModel.path },
          });
          console.log(`✅ Added local-file model: ${localModel.name}`);
        } else if (existing.provider === "local-file") {
          // Backfill path for existing local-file models that may be missing it
          const params = (existing.parameters as any) ?? {};
          if (!params.path) {
            console.log(`🔧 Backfilling path for local-file model: ${localModel.name}`);
            await storage.updateModel(existing.id, {
              parameters: { ...params, path: localModel.path }
            });
          }
        }
        
        // Only add to syncedModels if not a GPU bridge duplicate
        if (!isGpuBridge || !existing || existing.provider !== "ollama") {
          syncedModels.push({
            name: localModel.name,
            provider: "local-file",
            path: localModel.path,
          });
        }
      }

      // Sync OpenRouter models if API key is configured
      try {
        const apiKey = await storage.getSetting(undefined, 'openrouter_api_key');
        if (apiKey?.value) {
          const { OpenRouterService } = await import('./services/openrouter.js');
          const openrouterService = new OpenRouterService();
          openrouterService.setApiKey(apiKey.value as string);
          const openrouterModels = await openrouterService.fetchOpenRouterModels();
          
          // Add/update all OpenRouter models as immediately available (no pull needed)
          for (const orModel of openrouterModels) {
            const existing = await storage.getModel(orModel.name);
            if (!existing) {
              await storage.createModel({
                name: orModel.name,
                provider: "openrouter",
                isAvailable: true,
                parameters: { 
                  brand: orModel.brand,
                  pricing: orModel.pricing,
                  contextLength: orModel.contextLength 
                },
              });
            } else {
              // Update existing model to mark as available
              await storage.updateModel(existing.id, {
                isAvailable: true,
                parameters: { 
                  brand: orModel.brand,
                  pricing: orModel.pricing,
                  contextLength: orModel.contextLength 
                },
              });
            }
            syncedModels.push({
              name: orModel.name,
              provider: "openrouter",
              pricing: orModel.pricing,
            });
          }
        }
      } catch (error) {
        console.log('OpenRouter sync skipped:', error);
      }

      const models = await storage.getModels();
      res.json({ synced: true, models });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/models/catalog", async (req, res) => {
    try {
      const { OpenRouterService } = await import('./services/openrouter.js');
      const openrouterService = new OpenRouterService();
      
      const ollama = await getOllamaService();
      const ollamaAvailable = await ollama.isAvailable();
      
      // Fetch OpenRouter models if available
      let openrouterModels: any[] = [];
      try {
        const apiKey = await storage.getSetting(undefined, 'openrouter_api_key');
        if (apiKey?.value) {
          openrouterService.setApiKey(apiKey.value as string);
          openrouterModels = await openrouterService.fetchOpenRouterModels();
        }
      } catch (error) {
        console.log('OpenRouter not configured or unavailable');
      }
      
      // Catalog with local (Ollama/HuggingFace) and cloud (OpenRouter) models
      const catalog = [
        // Ollama Registry - Standard models
        { 
          name: "qwen2:1.5b", 
          size: "0.9GB", 
          description: "⚡ Ultra-fast 1.5B - best for phones",
          source: "ollama",
          provider: "ollama"
        },
        { 
          name: "llama3.2:1b", 
          size: "1.3GB", 
          description: "⭐ Recommended - smallest Llama 3.2",
          source: "ollama",
          provider: "ollama"
        },
        { 
          name: "gemma:2b", 
          size: "1.4GB", 
          description: "Google Gemma 2B - balanced",
          source: "ollama",
          provider: "ollama"
        },
        { 
          name: "llama3.2:3b-instruct", 
          size: "2.0GB", 
          description: "Llama 3.2 3B - better quality",
          source: "ollama",
          provider: "ollama"
        },
        { 
          name: "phi3:mini", 
          size: "2.3GB", 
          description: "⚠️ Phi-3 mini - may be slow on phones",
          source: "ollama",
          provider: "ollama"
        },
        { 
          name: "mistral:7b-instruct-v0.2", 
          size: "4.1GB", 
          description: "⚠️ Mistral 7B - strong hardware needed",
          source: "ollama",
          provider: "ollama"
        },
        
        // HuggingFace - Optimized GGUF models (requires download + import)
        { 
          name: "bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M", 
          size: "0.8GB", 
          description: "🤗 Llama 3.2 1B Q4 - quantized for mobile",
          source: "huggingface",
          provider: "huggingface",
          downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
        },
        { 
          name: "bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M", 
          size: "1.0GB", 
          description: "🤗 Qwen 2.5 1.5B Q4 - ultra-efficient",
          source: "huggingface",
          provider: "huggingface",
          downloadUrl: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"
        },
        
        // OpenRouter cloud models (requires API key)
        ...openrouterModels.slice(0, 10).map(model => {
          const promptCost = parseFloat(model.pricing?.prompt || '0') * 1000000; // Convert to per 1M tokens
          const completionCost = parseFloat(model.pricing?.completion || '0') * 1000000;
          const avgCost = (promptCost + completionCost) / 2;
          return {
            name: model.name,
            size: `$${avgCost.toFixed(3)}/1M tokens`,
            description: `☁️ ${model.name.split('/').pop()} - Cloud`,
            source: "openrouter",
            provider: "openrouter",
            pricing: model.pricing,
            contextLength: model.contextLength
          };
        })
      ];
      
      res.json({ catalog, available: true, openrouterAvailable: openrouterModels.length > 0 });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error),
        offline: true
      });
    }
  });

  app.post("/api/models/pull", async (req, res) => {
    try {
      const { name, source = "ollama", downloadUrl } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Model name is required" });
      }

      console.log(`📥 Pull request for model: ${name} (source: ${source})`);

      // Set up SSE for pull progress
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const ollama = await getOllamaService();
      const ollamaAvailable = await ollama.isAvailable();

      // For HuggingFace downloads, go directly to local-file mode (GPU bridge compatible)
      if (source === "huggingface") {
        if (!downloadUrl) {
          res.write(`data: ${JSON.stringify({ 
            error: "Download URL is required for HuggingFace models" 
          })}\n\n`);
          res.end();
          return;
        }

        // Validate downloadUrl is from HuggingFace (HTTPS only)
        try {
          const url = new URL(downloadUrl);
          const hostname = url.hostname.toLowerCase();
          
          // Only allow HTTPS
          if (url.protocol !== 'https:') {
            throw new Error('Only HTTPS downloads are allowed');
          }
          
          // Only allow huggingface.co and *.huggingface.co subdomains
          const isValidHF = hostname === 'huggingface.co' || hostname.endsWith('.huggingface.co');
          if (!isValidHF) {
            throw new Error('Invalid download source');
          }
        } catch (error) {
          res.write(`data: ${JSON.stringify({ 
            error: error instanceof Error ? error.message : "Download URL must be HTTPS from huggingface.co" 
          })}\n\n`);
          res.end();
          return;
        }

        console.log(`🤗 HuggingFace GGUF download: ${name}`);
        console.log(`📥 Downloading from: ${downloadUrl}`);

        try {
          // Determine models directory (Termux or local)
          const modelsDir = process.env.HOME 
            ? path.join(process.env.HOME, 'PocketLLM', 'models')
            : path.join(process.cwd(), 'models');
          
          await fs.mkdir(modelsDir, { recursive: true });
          
          // Sanitize filename from URL
          const urlFilename = downloadUrl.split('/').pop() || 'model.gguf';
          const safeFilename = urlFilename.replace(/[^a-zA-Z0-9._-]/g, '-');
          const targetPath = path.join(modelsDir, safeFilename);
          
          // Check if already exists
          try {
            await fs.access(targetPath);
            console.log(`ℹ️  Model already exists at: ${targetPath}`);
            res.write(`data: ${JSON.stringify({ progress: 100, status: 'already exists' })}\n\n`);
            
            // Ensure it's in database
            const modelName = safeFilename.replace('.gguf', '');
            const existingModels = await storage.getModels();
            const modelExists = existingModels.some(m => m.name === modelName);
            
            if (!modelExists) {
              console.log(`➕ Adding existing model to database: ${modelName}`);
              await storage.createModel({
                name: modelName,
                provider: "local-file",
                isAvailable: true,
                parameters: { 
                  source: "huggingface",
                  path: targetPath 
                },
              });
            }
            
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          } catch {
            // File doesn't exist, proceed with download
          }
          
          // Download GGUF file with progress tracking
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`Failed to download: ${response.statusText}`);
          }

          const totalSize = parseInt(response.headers.get('content-length') || '0');
          let downloadedSize = 0;
          
          const fileHandle = await fs.open(targetPath, 'w');
          const reader = response.body?.getReader();
          
          if (!reader) throw new Error('No response body');
          
          res.write(`data: ${JSON.stringify({ progress: 0, status: 'downloading GGUF' })}\n\n`);
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            await fileHandle.write(value);
            downloadedSize += value.length;
            const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
            
            res.write(`data: ${JSON.stringify({ 
              progress: Math.round(progress), 
              status: `downloading ${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB` 
            })}\n\n`);
          }
          
          await fileHandle.close();
          console.log(`✅ Download complete: ${targetPath}`);
          
          // Add to database as local-file (GPU bridge compatible)
          const modelName = safeFilename.replace('.gguf', '');
          const existingModels = await storage.getModels();
          const modelExists = existingModels.some(m => m.name === modelName);
          
          if (!modelExists) {
            console.log(`➕ Adding model to database: ${modelName}`);
            await storage.createModel({
              name: modelName,
              provider: "local-file",
              isAvailable: true,
              parameters: { 
                source: "huggingface",
                path: targetPath 
              },
            });
          }
          
          res.write(`data: ${JSON.stringify({ progress: 100, status: 'ready for use' })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        } catch (error) {
          console.error(`❌ HuggingFace import error:`, error);
          res.write(`data: ${JSON.stringify({ 
            error: error instanceof Error ? error.message : String(error) 
          })}\n\n`);
          res.end();
          return;
        }
      }

      // Ollama registry pull (default) - requires Ollama to be running
      if (!ollamaAvailable) {
        console.log(`❌ Ollama not available for registry pull`);
        res.write(`data: ${JSON.stringify({ 
          error: "Ollama not running. For GPU bridge mode, download models from HuggingFace catalog instead." 
        })}\n\n`);
        res.end();
        return;
      }
      
      console.log(`🔄 Starting Ollama pull for: ${name}`);
      
      try {
        let progressReceived = false;
        
        await ollama.pullModel(name, (progress, status) => {
          progressReceived = true;
          console.log(`📊 Pull progress: ${progress.toFixed(1)}% - ${status}`);
          res.write(`data: ${JSON.stringify({ progress, status })}\n\n`);
        });

        console.log(`✅ Pull completed. Progress updates received: ${progressReceived}`);

        // Verify model exists in Ollama before marking as available
        const ollamaModels = await ollama.listModels();
        console.log(`🔍 Ollama has ${ollamaModels.length} models:`, ollamaModels.map(m => m.name));
        
        const modelInOllama = ollamaModels.some(m => m.name === name);
        console.log(`✓ Model "${name}" in Ollama: ${modelInOllama}`);
        
        if (!modelInOllama) {
          throw new Error("Model pull completed but model not found in Ollama. Try syncing models.");
        }

        // Only add model to storage AFTER successful pull and verification
        const existingModels = await storage.getModels();
        const modelExists = existingModels.some(m => m.name === name);
        
        if (!modelExists) {
          console.log(`➕ Adding model to database: ${name}`);
          await storage.createModel({
            name,
            provider: "ollama",
            isAvailable: true,
            parameters: null,
          });
        } else {
          console.log(`ℹ️  Model already in database: ${name}`);
        }

        res.write(`data: [DONE]\n\n`);
        res.end();
      } catch (pullError) {
        // If pull fails and we have a HuggingFace mapping, download GGUF directly
        console.log(`⚠️  Ollama pull failed: ${pullError instanceof Error ? pullError.message : String(pullError)}`);
        
        const ggufMapping = getHuggingFaceGGUF(name);
        if (ggufMapping) {
          console.log(`🔄 Attempting direct GGUF download for GPU bridge...`);
          
          try {
            // Determine models directory (Termux or local)
            const modelsDir = process.env.HOME 
              ? path.join(process.env.HOME, 'PocketLLM', 'models')
              : path.join(process.cwd(), 'models');
            
            await fs.mkdir(modelsDir, { recursive: true });
            
            const targetPath = path.join(modelsDir, ggufMapping.filename);
            
            // Check if already exists
            try {
              await fs.access(targetPath);
              console.log(`ℹ️  Model already exists at: ${targetPath}`);
              res.write(`data: ${JSON.stringify({ progress: 100, status: 'already exists' })}\n\n`);
            } catch {
              // Download the GGUF file
              console.log(`📥 Downloading from: ${ggufMapping.url}`);
              res.write(`data: ${JSON.stringify({ progress: 0, status: 'downloading GGUF' })}\n\n`);
              
              const response = await fetch(ggufMapping.url);
              if (!response.ok) {
                throw new Error(`Download failed: ${response.statusText}`);
              }
              
              const totalSize = parseInt(response.headers.get('content-length') || '0');
              let downloadedSize = 0;
              
              const fileHandle = await fs.open(targetPath, 'w');
              const reader = response.body?.getReader();
              
              if (!reader) throw new Error('No response body');
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                await fileHandle.write(value);
                downloadedSize += value.length;
                const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
                
                res.write(`data: ${JSON.stringify({ 
                  progress: Math.round(progress), 
                  status: `downloading ${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB` 
                })}\n\n`);
              }
              
              await fileHandle.close();
              console.log(`✅ Download complete: ${targetPath}`);
            }
            
            // Add to database
            const existingModels = await storage.getModels();
            const modelName = ggufMapping.filename.replace('.gguf', '');
            const modelExists = existingModels.some(m => m.name === modelName);
            
            if (!modelExists) {
              console.log(`➕ Adding model to database: ${modelName}`);
              await storage.createModel({
                name: modelName,
                provider: "local-file",
                isAvailable: true,
                parameters: { 
                  source: "huggingface-auto",
                  path: targetPath 
                },
              });
            }
            
            res.write(`data: [DONE]\n\n`);
            res.end();
          } catch (downloadError) {
            console.error(`❌ Direct download failed:`, downloadError);
            throw downloadError;
          }
        } else {
          // No mapping available, re-throw original error
          throw pullError;
        }
      }
    } catch (error) {
      console.error(`❌ Pull error:`, error);
      res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`);
      res.end();
    }
  });

  app.post("/api/models/load", async (req, res) => {
    const { name } = req.body ?? {};
    try {
      if (!name) {
        return res.status(400).json({ error: "Model name is required" });
      }

      console.log(`🔄 Load request for model: "${name}"`);
      
      // Check model provider
      const modelInfo = await storage.getModel(name);
      
      if (!modelInfo) {
        return res.status(404).json({ error: "Model not found in database" });
      }
      
      // Cloud and remote models don't need to be "loaded" - they're instantly available
      if (modelInfo.provider === "openrouter") {
        console.log(`✅ Cloud model selected (no load needed): "${name}"`);
        const ollama = await getOllamaService();
        ollama.setLoadedModel(name);
        
        return res.json({ 
          success: true, 
          model: name,
          message: `Cloud model ${name} ready` 
        });
      }
      
      if (modelInfo.provider === "remote-ollama") {
        console.log(`✅ Remote model selected (no load needed): "${name}"`);
        const ollama = await getOllamaService();
        ollama.setLoadedModel(name);
        
        return res.json({ 
          success: true, 
          model: name,
          message: `Remote model ${name} ready` 
        });
      }
      
      // Handle local-file models - import into Ollama if needed
      if (modelInfo.provider === "local-file") {
        const ollama = await getOllamaService();
        
        // Check if GPU bridge is active (it serves GGUF files directly without Ollama import)
        let isGpuBridge = false;
        try {
          const baseUrl = ollama.getBaseUrl();
          const healthResponse = await fetch(`${baseUrl}/api/health`, {
            method: "GET",
            signal: AbortSignal.timeout(2000),
          });
          if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            isGpuBridge = healthData.gpu_enabled === true;
            console.log(`🔍 GPU bridge detection: gpu_enabled=${isGpuBridge}`);
          }
        } catch (error) {
          // If health check fails, assume standard Ollama
          console.log('Health check failed, assuming standard Ollama:', error);
        }
        
        if (isGpuBridge) {
          // GPU bridge serves GGUF files directly - no import needed, just mark as loaded
          console.log(`✅ GPU bridge mode detected - model ready: "${name}"`);
          ollama.setLoadedModel(name);
          
          return res.json({ 
            success: true, 
            model: name,
            message: `GPU-accelerated model ${name} ready` 
          });
        }
        
        // Standard Ollama: check if model needs to be imported
        const ollamaModels = await ollama.listModels();
        const existsInOllama = ollamaModels.some(m => m.name === name);
        
        if (!existsInOllama) {
          // Import the GGUF file into Ollama
          const modelPath = modelInfo.parameters?.path;
          if (!modelPath) {
            return res.status(400).json({ 
              error: "Model path not found in database. Please re-sync models." 
            });
          }
          
          console.log(`📦 Auto-importing local-file model: "${name}"`);
          await ollama.createModelFromFile(name, modelPath);
        }
        
        // Now load it normally
        await ollama.loadModel(name);
        console.log(`✅ Local-file model loaded successfully: "${name}"`);
        
        return res.json({ 
          success: true, 
          model: name,
          message: `Model ${name} loaded and ready` 
        });
      }
      
      // Local Ollama models need to be loaded
      const ollama = await getOllamaService();
      await ollama.loadModel(name);
      
      console.log(`✅ Local model loaded successfully: "${name}"`);
      
      res.json({ 
        success: true, 
        model: name,
        message: `Model ${name} loaded and ready` 
      });
    } catch (error) {
      console.error(`❌ Failed to load model "${name}":`, error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to load model"
      });
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
      
      // Get file extension for fallback type checking
      const ext = originalname.toLowerCase().substring(originalname.lastIndexOf('.'));
      
      // Extract text content based on file type
      let content = "";
      let actualMimetype = mimetype;
      
      // Handle PDF files
      if (mimetype === "application/pdf" || mimetype === "application/x-pdf" || 
          (mimetype === "application/octet-stream" && ext === ".pdf")) {
        // Parse PDF - pdf-parse only works with CommonJS so we use createRequire
        const Module = await import('node:module');
        const require = Module.createRequire(import.meta.url);
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(buffer);
        content = pdfData.text;
        actualMimetype = "application/pdf";
      } 
      // Handle DOCX/DOC files
      else if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
               mimetype === "application/msword" || 
               (mimetype === "application/octet-stream" && (ext === ".docx" || ext === ".doc"))) {
        // Parse DOCX
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
        actualMimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } 
      // Handle text files
      else if (mimetype === "text/plain" || 
               (mimetype === "application/octet-stream" && ext === ".txt")) {
        content = buffer.toString("utf-8");
        actualMimetype = "text/plain";
      } 
      // Handle JSON files
      else if (mimetype === "application/json" || 
               (mimetype === "application/octet-stream" && ext === ".json")) {
        content = buffer.toString("utf-8");
        actualMimetype = "application/json";
      } 
      // Handle CSV files
      else if (mimetype === "text/csv" || 
               (mimetype === "application/octet-stream" && ext === ".csv")) {
        content = buffer.toString("utf-8");
        actualMimetype = "text/csv";
      } 
      else {
        return res.status(400).json({ error: `Unsupported file type: ${mimetype} (${ext})` });
      }

      // Create document
      const document = await storage.createRagDocument({
        fileName: originalname,
        fileType: actualMimetype,
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
      // Filter out sensitive password data - never send to client
      const safeSettings = settings.filter(s => s.key !== "cloud_models_password");
      res.json(safeSettings);
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

  // MCP Tool Execution
  app.post("/api/mcp/tools/execute", async (req, res) => {
    try {
      const { mcpService } = await import("./services/mcp");
      const { serverId, toolName, args } = req.body;

      if (!serverId || !toolName) {
        return res.status(400).json({ error: "serverId and toolName are required" });
      }

      const result = await mcpService.executeTool({
        serverId,
        toolName,
        args: args || {},
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      console.error("MCP tool execution error:", error);
      res.status(500).json({ error: "Failed to execute MCP tool" });
    }
  });

  // Test MCP server connection
  app.post("/api/mcp/servers/:id/test", async (req, res) => {
    try {
      const { mcpService } = await import("./services/mcp");
      const { id } = req.params;
      const result = await mcpService.testConnection(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to test MCP server connection" });
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

  // System network check endpoint
  app.get("/api/system/network", async (_req, res) => {
    try {
      // Check if we can reach OpenRouter (for cloud model availability)
      const openrouterCheck = await fetch("https://openrouter.ai/api/v1/models", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000) // 5 second timeout
      }).then(() => true).catch(() => false);

      res.json({
        online: true,
        openrouter: openrouterCheck,
      });
    } catch (error) {
      res.json({
        online: false,
        openrouter: false,
      });
    }
  });

  // Secure password verification endpoint
  app.post("/api/auth/verify-cloud-password", async (req, res) => {
    try {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: "Password is required", verified: false });
      }

      const storedPassword = await storage.getSetting(undefined, "cloud_models_password");
      const passwordEnabled = await storage.getSetting(undefined, "cloud_models_password_enabled");
      
      // If password protection is not enabled, always verify
      if (passwordEnabled?.value !== true && passwordEnabled?.value !== "true") {
        return res.json({ verified: true });
      }

      // Check if the password matches
      const verified = password === storedPassword?.value;
      
      res.json({ verified });
    } catch (error) {
      res.status(500).json({ error: "Verification failed", verified: false });
    }
  });

  // Check if cloud password is enabled (does NOT return the password)
  app.get("/api/auth/cloud-password-enabled", async (_req, res) => {
    try {
      const passwordEnabled = await storage.getSetting(undefined, "cloud_models_password_enabled");
      res.json({ 
        enabled: passwordEnabled?.value === true || passwordEnabled?.value === "true" 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check password status", enabled: false });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
