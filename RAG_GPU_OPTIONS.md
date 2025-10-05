# RAG GPU Compatibility Options

## Overview
Current RAG implementation uses Ollama's embedding models (nomic-embed-text, mxbai-embed-large, all-minilm) which run via Ollama server. For GPU-accelerated environments using the custom GPU bridge, several alternatives exist.

## Option 1: Ollama GPU-Accelerated Embeddings (Current - Recommended)

### How it works
Standard Ollama server with GPU support

### Models
- nomic-embed-text (137M params)
- mxbai-embed-large (335M params)
- all-minilm (33M params)

### Pros
- ✅ Already integrated and working
- ✅ GPU acceleration via Ollama's built-in GPU support
- ✅ No code changes needed
- ✅ Consistent API with chat models

### Cons
- ❌ Requires Ollama server running (separate from GPU bridge)
- ❌ Slightly larger memory footprint than pure llama.cpp

### Setup
```bash
ollama pull nomic-embed-text  # Auto-pulled on server startup
```

### GPU Support
Enable GPU in Ollama via environment variables (OLLAMA_GPU_LAYERS, etc.)

## Option 2: llama.cpp Direct Embedding (GPU Bridge Compatible)

### How it works
Use llama.cpp Python bindings directly for embeddings

### Models
Any GGUF embedding model:
- nomic-embed-text.gguf
- all-minilm.gguf

### Pros
- ✅ Works with GPU bridge (same llama-cpp-python instance)
- ✅ Lower memory overhead
- ✅ Full GPU control (layers, batch size, etc.)
- ✅ No separate Ollama server needed

### Cons
- ❌ Requires Python embedding service
- ❌ Need to implement embedding endpoint in GPU bridge
- ❌ Additional development work

### Implementation Path
1. Add embedding endpoint to `scripts/ollama-gpu-bridge-v2.py`
2. Download GGUF embedding models to `~/PocketLLM/models/`
3. Update backend to call GPU bridge for embeddings instead of Ollama
4. Use llama_cpp.Llama with `embedding=True` flag

### Example Code
```python
from llama_cpp import Llama

# Load embedding model with GPU
embedding_model = Llama(
    model_path="/path/to/nomic-embed-text.gguf",
    embedding=True,
    n_gpu_layers=32,  # Full GPU offload
    n_ctx=512,        # Embedding context
)

# Generate embeddings
embeddings = embedding_model.embed("your text here")
```

## Option 3: Sentence Transformers with ONNX Runtime (Mobile GPU)

### How it works
Use ONNX optimized models with mobile GPU acceleration

### Models
- all-MiniLM-L6-v2 (22M params)
- paraphrase-MiniLM-L6-v2 (22M params)

### Pros
- ✅ Excellent mobile GPU support (OpenCL, Vulkan, NPU)
- ✅ Very small models (22M params)
- ✅ Fast inference on mobile devices
- ✅ No server needed (runs in-process)

### Cons
- ❌ Different ecosystem (Python ML stack)
- ❌ Requires onnxruntime-gpu or onnxruntime-mobile
- ❌ More complex Termux setup

### Setup
```bash
pip install sentence-transformers onnx onnxruntime-gpu
# Convert model to ONNX format for mobile optimization
```

## Option 4: BM25 Keyword Search (No GPU Needed)

### How it works
Traditional keyword-based retrieval using TF-IDF/BM25

### Pros
- ✅ Zero GPU/model requirements
- ✅ Extremely fast on CPU
- ✅ No embeddings to compute or store
- ✅ Works completely offline
- ✅ Deterministic results

### Cons
- ❌ Less semantic understanding than vector embeddings
- ❌ Keyword matching only (no synonyms or conceptual similarity)
- ❌ Requires good keyword overlap between query and documents

### Implementation
PostgreSQL full-text search with ts_rank or external BM25 library

## Option 5: Hybrid Approach (BM25 + Embeddings)

### How it works
Combine keyword search (BM25) with semantic search (embeddings)

### Pros
- ✅ Best of both worlds (keyword precision + semantic recall)
- ✅ Fallback to BM25 when embeddings unavailable
- ✅ Industry standard (used by many production RAG systems)

### Cons
- ❌ More complex implementation
- ❌ Need to balance/weight both scoring methods

### Implementation
Run both searches, merge and re-rank results

### GPU Compatibility
- Embedding component can use GPU via any of Options 1-3
- BM25 component runs on CPU (no GPU needed)
- Can operate in degraded mode using only BM25 when GPU unavailable
- Optimal configuration: GPU-accelerated embeddings (Option 1 or 2) + CPU BM25

## Recommended Approach for Termux + GPU Bridge

### 1. Short term: Continue using Ollama with GPU-accelerated embeddings (Option 1)
- Already working and integrated
- Enable GPU via Ollama environment variables
- Minimal changes needed

### 2. Long term: Implement llama.cpp embeddings in GPU bridge (Option 2)
- Add `/api/embeddings` endpoint to ollama-gpu-bridge-v2.py
- Use same GPU setup as chat models
- Unified GPU acceleration for both chat and embeddings

### 3. Fallback option: Implement BM25 keyword search (Option 4)
- Use when GPU/embeddings unavailable
- PostgreSQL built-in full-text search
- Zero dependencies

## Current Status (October 5, 2025)
- ✅ RAG uses Ollama embeddings (nomic-embed-text default)
- ✅ Works with standard Ollama server
- ⚠️  GPU bridge currently only handles chat inference
- ✅ Embedding models can use GPU via Ollama's native GPU support

## Next Steps
1. Enable GPU in Ollama for embedding models (short term)
2. Consider implementing llama.cpp direct embedding in GPU bridge (long term)
3. Implement BM25 fallback for offline/no-GPU scenarios
