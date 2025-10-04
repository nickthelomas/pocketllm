import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Auto-pull embedding model on first launch if not available
async function ensureEmbeddingModel() {
  try {
    const { getOllamaService } = await import('./services/ollama.js');
    const ollama = await getOllamaService();
    const isAvailable = await ollama.isAvailable();
    
    if (!isAvailable) {
      log("Ollama not available, skipping embedding model check");
      return;
    }

    const models = await ollama.listModels();
    const hasEmbeddingModel = models.some((m: any) => 
      m.name.includes('nomic-embed-text') || 
      m.name.includes('mxbai-embed-large') ||
      m.name.includes('all-minilm')
    );

    if (!hasEmbeddingModel) {
      log("No embedding model found, auto-pulling nomic-embed-text...");
      try {
        for await (const status of ollama.pullModel('nomic-embed-text')) {
          if (status.status) {
            log(`Embedding model pull: ${status.status}`);
          }
        }
        log("✅ Embedding model nomic-embed-text pulled successfully");
      } catch (pullError) {
        log("⚠️ Failed to auto-pull embedding model: " + String(pullError));
      }
    }
  } catch (error) {
    log("⚠️ Embedding model check failed: " + String(error));
  }
}

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Auto-pull embedding model in background (non-blocking)
    ensureEmbeddingModel().catch(err => 
      log("Embedding model initialization error:", err)
    );
  });
})();
