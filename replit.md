# Pocket LLM

## Overview
Pocket LLM is a local-first, full-stack LLM application designed for mobile use as a web app or Android APK. It provides a robust, offline-capable AI chat experience with multi-provider LLM support, advanced RAG capabilities, and hierarchical conversation memory. The project aims to deliver a powerful, private, and customizable LLM solution directly on user devices, minimizing cloud dependency while offering optional cloud and remote access.

## Recent Changes (October 2025)

### MCP Tool Execution Implementation (October 5, 2025)
- **Backend MCP Service**: Created secure tool execution service with demo tools
  - Safe mathematical expression parser (no eval vulnerability)
  - Demo tools: search, calculate, weather, fetch_data, code_execution
  - Tool validation and server status checking
- **API Endpoints**: Added `/api/mcp/tools/execute` and `/api/mcp/servers/:id/test`
- **Frontend Integration**: Updated MCPToolsDialog with full API integration
  - Real-time tool execution with loading states
  - Result display with JSON formatting
  - Toast notifications for success/failure
  - Server management through Settings modal
- **Security**: Fixed critical eval() vulnerability with safe expression parser

### Bug Fixes and UI Improvements (October 4, 2025)
- **Fixed Model Loading Timeout**: Extended timeout from 30s to 60s with loading spinner and toast notifications
- **Fixed Health Monitor**: Now correctly tracks and displays actual loaded model state with auto-refresh
- **Fixed RAG Document Upload**: Properly accepts PDF, DOCX, TXT, CSV, JSON files with improved MIME type detection
- **Added Mobile RAG Panel**: Sliding panel using Sheet component with FileStack icon trigger for mobile access
- **Fixed Model Auto-Selection**: Corrected initial state to allow proper smallest model selection on startup
- **Fixed Settings Save**: Resolved null value database errors by converting nulls to empty strings

### GPU Acceleration Support (October 4-5, 2025)
- **Settings UI**: Added comprehensive GPU configuration in Settings modal
  - Enable/disable GPU acceleration toggle
  - GPU layers slider (0-32) for layer offloading
  - Main GPU device selection
  - CPU threads configuration
  - Batch size settings
  - Low VRAM mode for mobile devices
- **Termux Setup Script**: Enhanced `scripts/termux-gpu-setup.sh` for mobile GPU optimization
  - Auto-detects chipset without dumpsys (works in Termux)
  - Handles numpy installation via pip
  - Installs appropriate GPU libraries (OpenCL/Vulkan)
  - Compiles llama.cpp with GPU support
  - Configures optimal settings per device type
  - Provides device-specific optimization tips
- **Auto GPU on Startup**: Modified `termux-start.sh` to automatically use GPU settings
- **Performance Monitor**: Added `scripts/termux-monitor.sh` for real-time monitoring
  - CPU usage with visual progress bars
  - Memory usage tracking
  - GPU utilization (when available)
  - Ollama and backend service status
  - Battery level monitoring
- **GPU Verification Tool**: Created `scripts/verify-gpu.sh` to check GPU setup

## Recent Changes (October 2025)

### Multi-Provider Architecture Implemented
- **OpenRouter Cloud Integration**: 
  - Added OpenRouterService with streaming chat support
  - Model catalog with pricing transparency (displayed as $/1M tokens)
  - API key management in Settings UI
  - **No Pull Required**: Cloud models instantly available after sync (no download needed)
  - Automatic network detection (Cloud tab greys out when offline)
  
- **Remote Ollama Support**: 
  - RemoteOllamaService for Tailscale/VPN connections
  - Remote-optimized timeouts and error handling
  - Configurable remote URL in Settings UI
  
- **Provider-Aware Chat Routing**: 
  - `/api/chat/stream` automatically routes to correct service based on model provider
  - Supports local Ollama, OpenRouter, and remote Ollama with appropriate error messages
  
- **Enhanced Model Management UI**:
  - Multi-tab interface (Local/Cloud/Remote) in ModelSelector
  - Network status indicator with Wifi/WifiOff icons
  - **Brand Categorization**: Purple badges show provider brand (Openai, Anthropic, Google, Meta, etc.)
  - Provider badges (HF for HuggingFace, OR for OpenRouter)
  - Settings fields for OpenRouter API key and Remote Ollama URL
  - **Background Downloads**: HuggingFace models download in background, app remains usable
  
- **Auto-Pull Embedding Models**: 
  - Server startup checks for embedding models (nomic-embed-text, mxbai-embed-large, all-minilm)
  - Automatically pulls nomic-embed-text if none found
  - Non-blocking background task with graceful failure handling

### OpenRouter Workflow Improvements
- **Instant Availability**: OpenRouter models marked as available immediately after sync (no pull step)
- **Automatic Brand Extraction**: Extracts and formats brand names from model IDs (e.g., `agentica-org` → "Agentica Org")
- **Upsert Logic**: Sync updates existing models to ensure availability and refresh metadata
- **Settings Validation**: Fixed empty string checks to properly detect configured API keys
- **Pricing Display**: Shows prompt/completion costs per 1M tokens for cloud models
- **Full Model Names**: Changed from truncate to break-all for model names to show size indicators (2b, 3b, etc.)

### Provider-Aware Health Check (October 2025)
- **Intelligent Health Monitoring**: System health now detects active model provider
  - **Cloud Models (OpenRouter)**: Shows "ok" status when API key is configured
  - **Remote Models**: Shows "ok" status when remote URL is configured
  - **Local Models**: Checks local Ollama server connection
- **No False Errors**: Cloud/remote models work independently of local Ollama status
- **Auto-Refresh**: Health dialog refetches status when opened for fresh data
- **Fixed Settings Keys**: Corrected key naming (snake_case) for reliable API key detection

## User Preferences
- Always prioritize local-only solutions
- No cloud dependencies whatsoever
- Offline-first design philosophy
- Mobile-first: Termux + APK deployment

## System Architecture

### Core Design Principles
- **Local-first**: Prioritizes local model inference and data storage.
- **Multi-Provider LLM Support**: Integrates local Ollama, remote Ollama via VPN/Tailscale, and optional cloud models via OpenRouter.
- **Offline-First**: Core features are fully functional without an internet connection.
- **Flexible Deployment**: Supports fully local, hybrid, or cloud-enhanced setups.

### Technology Stack
- **Frontend**: React, TypeScript, Vite, TailwindCSS, shadcn/ui.
- **Backend**: Express, TypeScript.
- **Storage**: PostgreSQL (development/cloud) or in-memory MemStorage (Termux/Android) with auto-selection.
- **LLM Runtime**: Ollama local inference server.

### Key Features and Specifications
- **Model Management**:
    - Syncs models from Ollama, local directories, HuggingFace (GGUF), and OpenRouter.
    - Supports streaming model downloads from Ollama registry and HuggingFace.
    - Multi-tab UI for local, cloud, and remote model browsing.
    - Automatic import of HuggingFace GGUF models into Ollama.
    - Auto-selection of the smallest available model on first launch.
- **Multi-Provider Chat Streaming**:
    - Routes chat requests to appropriate LLM services based on model provider.
    - Real-time streaming via Server-Sent Events (SSE).
    - Conversation persistence with metadata (auto-title, favorites, tags, search).
    - Adjustable LLM parameters (temperature, top_p, top_k, max_tokens, seed).
- **RAG Document Processing**:
    - Supports PDF, DOCX, TXT, CSV, JSON formats.
    - Uses Ollama for local embeddings (nomic-embed-text default).
    - Smart text chunking with configurable size.
    - Vector storage in PostgreSQL with `pgvector` extension for efficient similarity search.
    - Provides inline document citations and automatic semantic retrieval.
- **Hierarchical Conversation Memory**:
    - Maintains unlimited conversation history within a fixed token budget.
    - Multi-tier summarization (direct and meta-summaries) using local Ollama models.
    - Intelligent context assembly and smart truncation to preserve critical information.
    - Configurable settings for raw message count, summary frequency, and token budget.
- **User Interface**:
    - Mobile-responsive layout with offcanvas sidebar and hamburger menu.
    - Settings panel for LLM parameters, memory, RAG configuration, and user profile.
    - Dark/light theme toggle.
- **Mobile Deployment**:
    - Client-server architecture for Termux (backend) and Capacitor/APK (frontend).
    - Automated installation script for Termux, Termux:Boot, and Termux:Widget.

### API Endpoints
- **Models**: `GET /api/models`, `GET /api/models/sync`, `POST /api/models/pull`.
- **Chat**: `POST /api/chat/stream`.
- **Conversations & Messages**: Full CRUD operations.
- **RAG Documents**: `POST /api/rag/upload`, `GET /api/rag/documents`, `DELETE /api/rag/documents/:id`.
- **Settings**: Key-value store per user.

### Data Model
- **Models**: Stores model metadata, restricted to `ollama`, `huggingface`, `local-file`, `openrouter`, `remote-ollama` providers.
- **Messages**: Conversation history with citations.
- **RAG Documents/Chunks**: Text content and embeddings.
- **Settings**: User-specific configurations.
- **Conversation Summaries**: Stores hierarchical summaries.

## External Dependencies
- **Ollama**: Local LLM inference server.
- **OpenRouter**: Optional cloud LLM API.
- **HuggingFace**: Source for GGUF models (downloaded and integrated locally).
- **PostgreSQL**: Database for persistent storage (including `pgvector` extension).
- **Tailscale/VPN**: For remote Ollama access.
- **Termux**: Android terminal emulator for local server deployment.
- **Capacitor**: For bundling the web app into an Android APK.