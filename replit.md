# Pocket LLM

A **strictly local-only** full-stack LLM application designed for phone use (web app wrappable to APK) with **zero cloud dependencies**.

## Core Architecture

### Local-Only LLM Support
- **Ollama Integration**: Primary LLM backend using local Ollama server (port 11434)
- **No Cloud APIs**: Zero dependencies on OpenAI, Anthropic, or any cloud providers
- **Offline-First**: All features work completely offline with local models

### Technology Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express + TypeScript
- **Storage**: In-memory (MemStorage) - easily migrated to SQLite/PostgreSQL
- **LLM**: Ollama local inference server
- **Model Discovery**: Auto-scan GGUF/GGML files from `./models` directory

## Key Features

### 1. Model Management
- **Sync Models**: `/api/models/sync` - Auto-discovers models from Ollama + local directory
- **Pull Models**: `/api/models/pull` - Download models from Ollama registry with streaming progress
- **Supported Providers**: 
  - `ollama` - Models from local Ollama server
  - `local-file` - GGUF/GGML files in `./models` folder

### 2. Multi-Thread Chat
- Real-time streaming responses via Server-Sent Events (SSE)
- Conversation persistence with full message history
- User profile system-prompt injection
- Adjustable LLM parameters (temperature, top_p, top_k, max_tokens, seed)
- **Conversation Metadata**:
  - Auto-title generation from first message (truncates to 60 chars)
  - Favorites: Star/unstar conversations for quick access
  - Tags: Add/remove custom tags for organization (shows max 2 in list)
  - Search: Filter conversations by title (case-insensitive)

### 3. RAG Document Processing
- **File Formats**: PDF, DOCX, TXT, CSV, JSON
- **Local Embeddings**: Ollama embedding models (nomic-embed-text default) with fallback
- **Chunking**: Smart text splitting with configurable chunk size (default: 512 words)
- **Vector Storage**: PostgreSQL with **pgvector extension** for optimized similarity search
- **pgvector Features**: Native vector(768) data type, IVFFlat index, <=> cosine distance operator
- **Citation Support**: Inline document references in responses with full metadata
- **Auto-Retrieval**: Automatic semantic search on user queries (configurable threshold)
- **Performance**: 10-100x faster similarity search at scale vs manual calculations

### 4. MCP Server Integration
- Tool execution framework ready
- Schema and UI implemented
- Awaiting MCP protocol implementation

### 5. Settings Panel
- LLM Parameters: Temperature, Top-P, Top-K, Max Tokens, Seed
- Memory Depth: Adjustable context window
- RAG Configuration: Chunk size, top-k retrieval
- User Profile: Custom system prompt injection
- Import/Export: Full conversation backup

## API Endpoints

### Models (Local-Only)
- `GET /api/models` - List available models
- `GET /api/models/sync` - Sync from Ollama + local directory
- `POST /api/models/pull` - Pull model from Ollama (SSE streaming)

### Chat
- `POST /api/chat/stream` - Streaming chat with Ollama (SSE)
- Supports: context, RAG sources, custom settings

### Conversations & Messages
- Full CRUD for conversations and messages
- `DELETE /api/conversations/:id/messages` - Clear chat (keep conversation)

### RAG Documents
- `POST /api/rag/upload` - Upload document with chunking
- `GET /api/rag/documents` - List uploaded documents
- `DELETE /api/rag/documents/:id` - Remove document

### Settings & MCP
- Settings key-value store per user
- MCP server registration and tool listing

## Local Development

### Prerequisites
1. **Ollama**: Install and run locally on port 11434
   ```bash
   # Install: https://ollama.ai/download
   ollama serve
   ```

2. **Models**: Pull at least one model
   ```bash
   ollama pull llama3.2:3b-instruct
   ollama pull mistral:7b-instruct-v0.2
   ```

### Running the App
```bash
npm run dev
# Server: http://localhost:5000
# Ollama: http://localhost:11434
```

### Model Directory
- Place GGUF/GGML files in `./models/`
- Auto-discovered on sync

## Data Model

### Schema (Local-Only)
- **Models**: `provider` enum restricted to `["ollama", "local-file"]`
- **Messages**: Store conversation history with citations
- **RAG Documents/Chunks**: Text content + embeddings
- **Settings**: Key-value configuration per user
- **MCP Servers**: Tool server registry

## Recent Changes (Oct 2025)
- ✅ Refactored to strictly local-only (removed all cloud provider support)
- ✅ Implemented Ollama service layer with streaming
- ✅ Added local model directory scanner for GGUF files
- ✅ Updated frontend ModelSelector with Sync/Pull functionality
- ✅ Streaming chat endpoint now uses Ollama (no mock data)
- ✅ Fixed TypeScript errors and type safety throughout
- ✅ Migrated to PostgreSQL for full data persistence
- ✅ Implemented real local embeddings via Ollama API (nomic-embed-text)
- ✅ Added automatic RAG retrieval with configurable settings
- ✅ Integrated pgvector extension for 10-100x faster similarity search
- ✅ Atomic insert with dimensional validation for embeddings
- ✅ Added DELETE endpoint for RAG documents with cascade cleanup
- ✅ Implemented conversation metadata (tags, favorites, auto-titles)
- ✅ Added conversation search/filtering
- ✅ Enhanced export/import with settings and RAG metadata (v1.1)
- ✅ Implemented dark/light theme toggle with persistence
- ✅ Configured Capacitor for Android APK packaging

## Mobile Deployment (APK)

### Architecture
The app uses a **client-server architecture** suitable for Termux deployment:
1. **Backend (Express + Ollama)**: Runs in Termux on port 5000
2. **Frontend (React)**: Can be accessed via browser OR bundled as APK

### APK Setup with Capacitor
- **App ID**: com.pocketllm.app
- **App Name**: Pocket LLM
- **Platform**: Android (via Capacitor)
- **Server URL**: http://localhost:5000 (connects to Termux backend)

### Building the APK
```bash
# 1. Build frontend
npm run build

# 2. Sync with Capacitor
npx cap sync android

# 3. Open in Android Studio to build APK
npx cap open android
# OR build directly:
cd android && ./gradlew assembleDebug

# APK location: android/app/build/outputs/apk/debug/app-debug.apk
```

### Usage on Android
1. Install Termux on Android
2. Install Ollama in Termux: `pkg install ollama`
3. Start Ollama: `ollama serve`
4. Run Express backend in Termux: `npm run dev` (port 5000)
5. Install and open the Pocket LLM APK
6. APK connects to localhost:5000 automatically

**Note**: Backend must be running in Termux before opening the APK

## User Preferences
- Always prioritize local-only solutions
- No cloud dependencies whatsoever
- Offline-first design philosophy
- Mobile-first: Termux + APK deployment
