# Pocket LLM

## Overview
Pocket LLM is a local-first, full-stack LLM application designed for mobile use as a web app or Android APK. It provides a robust, offline-capable AI chat experience with multi-provider LLM support, advanced RAG capabilities, and hierarchical conversation memory. The project aims to deliver a powerful, private, and customizable LLM solution directly on user devices, minimizing cloud dependency while offering optional cloud and remote access. It provides an offline-first design philosophy.

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
- **Model Management**: Syncs models from Ollama, local directories, HuggingFace (GGUF), and OpenRouter. Supports streaming downloads and multi-tab UI for browsing.
- **Multi-Provider Chat Streaming**: Routes chat requests to appropriate LLM services, offering real-time streaming via Server-Sent Events (SSE) and adjustable LLM parameters.
- **RAG Document Processing**: Supports PDF, DOCX, TXT, CSV, JSON formats, uses Ollama for local embeddings, and vector storage in PostgreSQL with `pgvector` for similarity search, providing inline citations.
- **Hierarchical Conversation Memory**: Maintains unlimited conversation history within a fixed token budget using multi-tier summarization and intelligent context assembly.
- **User Interface**: Mobile-responsive layout with offcanvas sidebar, settings panel, and dark/light theme toggle.
- **Mobile Deployment**: Client-server architecture for Termux (backend) and Capacitor/APK (frontend) with automated installation scripts.
- **GPU Acceleration**: Supports GPU configuration for model inference, including layer offloading and device selection.

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
- **HuggingFace**: Source for GGUF models.
- **PostgreSQL**: Database for persistent storage (including `pgvector` extension).
- **Tailscale/VPN**: For remote Ollama access.
- **Termux**: Android terminal emulator for local server deployment.
- **Capacitor**: For bundling the web app into an Android APK.