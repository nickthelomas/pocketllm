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
- **Storage**: 
  - **Development/Cloud**: PostgreSQL via DATABASE_URL
  - **Termux/Android**: MemStorage (in-memory with pre-configured defaults)
  - Auto-selects based on USE_MEMSTORAGE env var or DATABASE_URL presence
- **LLM**: Ollama local inference server
- **Model Discovery**: Auto-scan GGUF/GGML files from `./models` directory

## Key Features

### 1. Model Management
- **Sync Models**: `/api/models/sync` - Auto-discovers models from Ollama + local directory with detailed metadata
- **Pull Models**: `/api/models/pull` - Download models from Ollama registry OR HuggingFace with streaming progress
- **Catalog Browser**: `/api/models/catalog` - Browse available models from Ollama and HuggingFace with sizes/descriptions before pulling
- **HuggingFace Integration**: Download quantized GGUF models directly from HuggingFace
  - **Security**: HTTPS-only downloads from `huggingface.co` and `*.huggingface.co` subdomains
  - **Auto-Import**: Downloads GGUF → Creates Modelfile → Imports to Ollama → Adds to database
  - **Progress Tracking**: Real-time download progress in MB via SSE streaming
  - **Command Safety**: Uses `execFile` with sanitized model names to prevent injection
- **Auto-Selection**: Automatically selects smallest model on first launch
- **Local Persistence**: Selected model saved to localStorage
- **Validation**: Only allows selecting models that exist locally
- **Offline-First**: Graceful degradation with clear error messages when Ollama unavailable
- **Supported Providers**: 
  - `ollama` - Models from local Ollama server
  - `huggingface` - GGUF models from HuggingFace (auto-imported to Ollama)
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

### 4. Hierarchical Conversation Memory
- **Unlimited History**: Maintain infinite conversation context within a fixed token budget
- **Multi-Tier Summarization**:
  - **Tier 1**: Direct summaries of older message batches (every N turns)
  - **Tier 2**: Meta-summaries combining multiple Tier 1 summaries
- **Local Summarization**: Uses Ollama models for all summary generation (zero cloud dependencies)
- **Context Assembly**: Automatic hierarchical context building (system prompt → tier-2 → tier-1 → last N raw messages)
- **Configurable Settings**:
  - `rawMessageCount`: Number of recent messages to keep in full (default: 10)
  - `summaryFrequency`: Summarize every N turns (default: 10)
  - `tokenBudget`: Maximum tokens for context (default: 4000)
- **Smart Truncation**: Preserves system prompt and recent messages, trims summaries as needed
- **Database Storage**: PostgreSQL table `conversation_summaries` with tier/range metadata

### 5. MCP Server Integration
- Tool execution framework ready
- Schema and UI implemented
- Awaiting MCP protocol implementation

### 6. Settings Panel
- LLM Parameters: Temperature, Top-P, Top-K, Max Tokens, Seed
- Hierarchical Memory: Raw message count, summary frequency, token budget
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

2. **Models**: Pull at least one model (smallest recommended)
   ```bash
   ollama pull llama3.2:1b  # Recommended: smallest, fastest
   ollama pull qwen2:1.5b    # Alternative: ultra-fast 1.5B
   ollama pull gemma:2b      # Alternative: balanced 2B
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
- ✅ **Mobile-responsive layout** with SidebarProvider pattern (offcanvas sidebar, hamburger menu at <768px)
- ✅ Fixed model dropdown rendering with placeholder and empty state handling
- ✅ Fixed conversation creation validation (optional fields for tags/isFavorite)
- ✅ **Hierarchical conversation memory** with multi-tier summarization for unlimited history
- ✅ Implemented local summarization using Ollama (tier-1 and tier-2 summaries)
- ✅ Added context builder with smart truncation preserving system prompt and recent messages
- ✅ Integrated memory settings UI (raw message count, summary frequency, token budget)
- ✅ **Mobile-first Settings modal** with fully scrollable 90vh flex layout
- ✅ **Base API URL persistence** (defaults to http://127.0.0.1:11434 for Termux compatibility)
- ✅ **Dynamic Ollama service configuration** - reads baseApiUrl from settings database
- ✅ **Completely rewrote ModelSelector** with auto-selection of smallest model, localStorage persistence, and pull catalog dialog
- ✅ **Enhanced model management**: sync returns detailed metadata, new catalog endpoint for browsing available models
- ✅ **Fixed model pull error handling** to properly propagate network/offline failures with destructive toasts
- ✅ **Settings UI user-friendly labels**: All technical terms replaced with plain English (Temperature → Response Creativity, etc.) with slider endpoint labels
- ✅ **Critical S24+ deployment fixes**:
  - Fixed health check false positives (now validates model loading, not just Ollama connection)
  - Improved model load validation (30s timeout, proper error messages, clears on failure)
  - Changed default model to llama3.2:1b (1.3GB) instead of 3b-instruct/phi3:mini (2.3GB) for better phone performance
  - Model catalog now shows smallest models first with performance warnings for heavy models
- ✅ **Latest UI/UX improvements (Oct 2025)**:
  - Fixed health monitor overflow - now scrollable with max-height 90vh, always closeable
  - Fixed model pull progress flickering - single persistent progress indicator in dialog instead of toast spam
  - Fixed duplicate models bug - only adds to DB after successful pull completion with deduplication check
  - Improved termux-install.sh - added Ollama health check retries (30s timeout), version validation, better error handling
  - Added HuggingFace model source - catalog now shows both Ollama and HuggingFace models with visual badges (HF models pending full implementation)
  - Better error handling for network/manifest failures during model pull
- ✅ **Critical Termux deployment fixes (Oct 2025)**:
  - Fixed termux-start.sh to pull llama3.2:1b (1.3GB) instead of incorrect 3b-instruct (2GB)
  - Changed backend to run with `npx tsx` directly for Termux compatibility
  - Ensures USE_MEMSTORAGE=true is properly respected without DATABASE_URL errors
  - Removed unnecessary production build step from Termux startup
  - Fixed DATABASE_URL lazy initialization in db.ts for MemStorage compatibility
  - Fixed tsx command resolution using npx for reliable execution in Termux environment
- ✅ **Model pull and mobile UX improvements (Oct 2025)**:
  - Fixed mobile overflow on pull catalog and health monitor dialogs with flex layout and scrollable content
  - Improved model pull flow: dialog stays open during download with persistent progress visibility
  - Added clear success/error states with manual close buttons after download
  - Prevents accidental dialog closing during active downloads with user feedback toast
  - Backend now verifies models exist in Ollama before adding to database (prevents failed models in dropdown)
  - Enhanced pull dialog with dynamic titles, "Try Again" button for errors, and completion confirmation

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

#### Automated Install (Recommended)
1. Install Termux, Termux:Boot, and Termux:Widget from F-Droid
2. Run: `bash termux-install.sh` (one command does everything)
3. Add home screen widgets for one-tap server control
4. Servers auto-start on device boot

See [TERMUX_INSTALL.md](TERMUX_INSTALL.md) for complete guide.

#### Manual Install
1. Install Termux on Android
2. Install Ollama in Termux: `pkg install ollama`
3. Start Ollama: `ollama serve`
4. Run Express backend in Termux: `npm run dev` (port 5000)
5. Install and open the Pocket LLM APK
6. APK connects to localhost:5000 automatically

**Note**: Automated install includes health monitoring, auto-retry, and widgets

## User Preferences
- Always prioritize local-only solutions
- No cloud dependencies whatsoever
- Offline-first design philosophy
- Mobile-first: Termux + APK deployment
