#!/data/data/com.termux/files/usr/bin/python3
"""
Ollama-compatible API bridge for llama.cpp with GPU acceleration (v2)
Simplified version using one-shot generation for reliability
"""

import os
import sys
import json
import time
import subprocess
import hashlib
import traceback
import threading
import uuid
from pathlib import Path
from typing import Optional, Dict, List, Generator
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import logging

# Configure logging to both file and console
LOG_FILE = Path.home() / "PocketLLM" / "logs" / "gpu-bridge.log"
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
LLAMA_BIN = Path.home() / "llama.cpp" / "build" / "bin" / "main"
MODELS_DIR = Path.home() / "PocketLLM" / "models"
CONFIG_DIR = Path.home() / ".ollama-bridge"

# Create directories if they don't exist
try:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    logger.error(f"Failed to create directories: {e}")
    sys.exit(1)

# Check if llama.cpp binary exists
if not LLAMA_BIN.exists():
    # Try alternative location (symlink)
    LLAMA_BIN_ALT = Path.home() / "llama.cpp" / "build" / "bin" / "llama-cli"
    if LLAMA_BIN_ALT.exists():
        logger.info(f"Using alternative binary: {LLAMA_BIN_ALT}")
        LLAMA_BIN = LLAMA_BIN_ALT
    else:
        logger.error(f"llama.cpp binary not found at {LLAMA_BIN} or {LLAMA_BIN_ALT}")
        logger.error("Please run: bash scripts/termux-gpu-setup.sh")
        sys.exit(1)

# Default GPU settings
DEFAULT_GPU_LAYERS = int(os.getenv('OLLAMA_GPU_LAYERS', 16))
DEFAULT_THREADS = os.cpu_count() or 4
DEFAULT_CONTEXT = 4096
DEFAULT_MAX_TOKENS = 512

# Model registry (maps Ollama model names to GGUF files)
MODEL_REGISTRY = {}

def scan_models():
    """Scan for available GGUF models"""
    global MODEL_REGISTRY
    MODEL_REGISTRY = {}
    
    if not MODELS_DIR.exists():
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        return
        
    for model_file in MODELS_DIR.glob("*.gguf"):
        path_str = str(model_file)
        filename = model_file.name
        stem = model_file.stem
        stem_lower = stem.lower()
        
        # Register with multiple name variations
        MODEL_REGISTRY[filename] = path_str
        MODEL_REGISTRY[stem] = path_str
        MODEL_REGISTRY[stem_lower] = path_str
        
        # Simplified names
        simple_name = stem_lower.replace("-", "_").replace(".", "_")
        MODEL_REGISTRY[simple_name] = path_str
        
        # Create Ollama-style names based on model type
        if "tinyllama" in stem_lower:
            MODEL_REGISTRY["tinyllama"] = path_str
            MODEL_REGISTRY["tinyllama:latest"] = path_str
            MODEL_REGISTRY["tinyllama:1b"] = path_str
            MODEL_REGISTRY["tinyllama:1.1b"] = path_str
            
        if "llama" in stem_lower and "3.2" in stem_lower:
            MODEL_REGISTRY["llama3.2:1b"] = path_str
            MODEL_REGISTRY["llama3.2"] = path_str
            MODEL_REGISTRY["llama3:latest"] = path_str
            MODEL_REGISTRY["llama3"] = path_str
            
        if "llama3" in stem_lower:
            MODEL_REGISTRY["llama3"] = path_str
            MODEL_REGISTRY["llama3:latest"] = path_str
            if "1b" in stem_lower:
                MODEL_REGISTRY["llama3:1b"] = path_str
                MODEL_REGISTRY["llama3.2:1b"] = path_str
                
        if "phi" in stem_lower:
            MODEL_REGISTRY["phi3:mini"] = path_str
            MODEL_REGISTRY["phi3:latest"] = path_str
            MODEL_REGISTRY["phi3"] = path_str
            MODEL_REGISTRY["phi"] = path_str
            
        if "gemma" in stem_lower:
            MODEL_REGISTRY["gemma:2b"] = path_str
            MODEL_REGISTRY["gemma:latest"] = path_str
            MODEL_REGISTRY["gemma"] = path_str
            
        if "qwen" in stem_lower:
            MODEL_REGISTRY["qwen:1.8b"] = path_str
            MODEL_REGISTRY["qwen:latest"] = path_str
            MODEL_REGISTRY["qwen:1.5b"] = path_str
            MODEL_REGISTRY["qwen"] = path_str
        
    logger.info(f"Found {len(set(MODEL_REGISTRY.values()))} unique models with {len(MODEL_REGISTRY)} name mappings")

def get_model_path(model_name: str) -> Optional[str]:
    """Get the actual model path from a model name"""
    # Refresh registry if empty
    if not MODEL_REGISTRY:
        scan_models()
        
    # Try direct lookup
    if model_name in MODEL_REGISTRY:
        return MODEL_REGISTRY[model_name]
        
    # Try lowercase
    model_lower = model_name.lower()
    if model_lower in MODEL_REGISTRY:
        return MODEL_REGISTRY[model_lower]
        
    # Try various transformations
    variations = [
        model_name.replace(" ", "-"),
        model_name.replace(" ", "_"),
        model_name.replace("-", "_"),
        model_name.replace("_", "-"),
    ]
    
    for variant in variations:
        if variant in MODEL_REGISTRY:
            return MODEL_REGISTRY[variant]
        if variant.lower() in MODEL_REGISTRY:
            return MODEL_REGISTRY[variant.lower()]
    
    # Try without tag
    if ":" in model_name:
        base_name = model_name.split(":")[0]
        if base_name in MODEL_REGISTRY:
            return MODEL_REGISTRY[base_name]
        if f"{base_name}:latest" in MODEL_REGISTRY:
            return MODEL_REGISTRY[f"{base_name}:latest"]
            
    # Try partial matches
    for key, path in MODEL_REGISTRY.items():
        if model_name.lower() in key.lower() or key.lower() in model_name.lower():
            logger.info(f"Partial match: {model_name} -> {key} -> {path}")
            return path
            
    # Check if it's a direct file path
    model_path = MODELS_DIR / model_name
    if model_path.exists() and model_path.suffix == ".gguf":
        return str(model_path)
    
    # Also check with .gguf extension added
    model_path_with_ext = MODELS_DIR / f"{model_name}.gguf"
    if model_path_with_ext.exists():
        return str(model_path_with_ext)
        
    logger.warning(f"Model not found: {model_name}")
    logger.debug(f"Available models: {list(MODEL_REGISTRY.keys())}")
    return None

def run_llama_generation(
    model_path: str, 
    prompt: str, 
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = 0.7,
    top_p: float = 0.9,
    top_k: int = 40,
    repeat_penalty: float = 1.1,
    seed: Optional[int] = None,
    stream: bool = True
) -> Generator[str, None, None]:
    """Run llama.cpp to generate text"""
    
    cmd = [
        str(LLAMA_BIN),
        "-m", model_path,
        "-ngl", str(DEFAULT_GPU_LAYERS),
        "-t", str(DEFAULT_THREADS),
        "-c", str(DEFAULT_CONTEXT),
        "-n", str(max_tokens),
        "--temp", str(temperature),
        "--top-p", str(top_p),
        "--top-k", str(top_k),
        "--repeat-penalty", str(repeat_penalty),
        "-p", prompt,
        "--simple-io",
        "--no-display-prompt"
    ]
    
    if seed is not None:
        cmd.extend(["-s", str(seed)])
    
    logger.debug(f"Running command: {' '.join(cmd[:10])}...")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # Stream output line by line
        full_response = []
        for line in iter(process.stdout.readline, ''):
            if line:
                line = line.rstrip()
                # Skip system messages and prompts
                if not line.startswith("system_info:") and not line.startswith("main:"):
                    full_response.append(line)
                    if stream:
                        yield line + "\n"
        
        # Wait for process to complete
        process.wait()
        
        # If not streaming, return full response
        if not stream:
            yield "\n".join(full_response)
            
        # Check for errors
        if process.returncode != 0:
            stderr = process.stderr.read()
            logger.error(f"llama.cpp error: {stderr}")
            
    except Exception as e:
        logger.error(f"Error running llama.cpp: {e}")
        logger.error(traceback.format_exc())
        yield f"Error: {str(e)}"

# API Routes

@app.route('/api/tags', methods=['GET'])
@app.route('/api/models', methods=['GET'])
def list_models():
    """List available models (Ollama compatible)"""
    scan_models()
    
    models = []
    seen_files = {}
    
    # Collect unique files and their preferred names
    for name, path in MODEL_REGISTRY.items():
        if path not in seen_files:
            # Prefer Ollama-style names
            if ":" in name:
                seen_files[path] = name
            elif path not in seen_files:
                seen_files[path] = name
    
    # Create model entries
    for path, preferred_name in seen_files.items():
        model_file = Path(path)
        if model_file.exists():
            size = model_file.stat().st_size
            modified = model_file.stat().st_mtime
            
            # Determine model family and size
            filename_lower = model_file.name.lower()
            family = "llama"
            param_size = "1B"
            
            if "tinyllama" in filename_lower:
                family = "tinyllama"
                param_size = "1.1B"
            elif "llama" in filename_lower:
                family = "llama"
                if "1b" in filename_lower:
                    param_size = "1B"
                elif "3b" in filename_lower:
                    param_size = "3B"
            elif "phi" in filename_lower:
                family = "phi"
                param_size = "3.8B"
            elif "gemma" in filename_lower:
                family = "gemma"
                param_size = "2B"
            elif "qwen" in filename_lower:
                family = "qwen"
                param_size = "1.8B"
            
            models.append({
                "name": preferred_name,
                "model": preferred_name,
                "modified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(modified)),
                "size": size,
                "digest": hashlib.sha256(preferred_name.encode()).hexdigest()[:12],
                "details": {
                    "format": "gguf",
                    "family": family,
                    "parameter_size": param_size,
                    "quantization_level": "Q4_K_M"
                }
            })
    
    # Add fake embedding model
    models.append({
        "name": "nomic-embed-text:latest",
        "model": "nomic-embed-text:latest",
        "modified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "size": 274302450,
        "digest": "0a109f422b47",
        "details": {
            "format": "gguf",
            "family": "nomic",
            "parameter_size": "137M",
            "quantization_level": "F16"
        }
    })
                
    return jsonify({"models": models})

@app.route('/api/show', methods=['POST'])
def show_model():
    """Show model details (Ollama compatible)"""
    data = request.get_json()
    model_name = data.get('name', '')
    
    model_path = get_model_path(model_name)
    if not model_path:
        return jsonify({"error": f"Model {model_name} not found"}), 404
    
    model_file = Path(model_path)
    return jsonify({
        "license": "Apache 2.0",
        "modelfile": f"FROM {model_file.name}",
        "parameters": "temperature 0.7\ntop_k 40\ntop_p 0.9",
        "template": "{{ .Prompt }}",
        "details": {
            "format": "gguf",
            "families": ["llama"],
            "parameter_size": "1.1B",
            "quantization_level": "Q4_K_M"
        }
    })

@app.route('/api/chat', methods=['POST'])
def chat():
    """Chat endpoint (Ollama compatible)"""
    data = request.get_json()
    model_name = data.get('model', '')
    messages = data.get('messages', [])
    stream = data.get('stream', True)
    
    # Get options
    options = data.get('options', {})
    temperature = options.get('temperature', 0.7)
    top_p = options.get('top_p', 0.9)
    top_k = options.get('top_k', 40)
    repeat_penalty = options.get('repeat_penalty', 1.1)
    seed = options.get('seed')
    max_tokens = options.get('num_predict', DEFAULT_MAX_TOKENS)
    
    # Get model path
    model_path = get_model_path(model_name)
    if not model_path:
        return jsonify({"error": f"Model {model_name} not found"}), 404
    
    # Format messages into a prompt
    prompt = ""
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        
        if role == 'system':
            prompt += f"System: {content}\n\n"
        elif role == 'user':
            prompt += f"User: {content}\n\n"
        elif role == 'assistant':
            prompt += f"Assistant: {content}\n\n"
    
    # Add final assistant marker
    prompt += "Assistant: "
    
    logger.info(f"Chat request - Model: {model_name}, Messages: {len(messages)}")
    
    def generate():
        response_id = str(uuid.uuid4())
        created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        if stream:
            # Stream each chunk
            for chunk in run_llama_generation(
                model_path, prompt, max_tokens, temperature, 
                top_p, top_k, repeat_penalty, seed, stream=True
            ):
                response = {
                    "model": model_name,
                    "created_at": created_at,
                    "message": {
                        "role": "assistant",
                        "content": chunk
                    },
                    "done": False
                }
                yield f"data: {json.dumps(response)}\n\n"
            
            # Send final chunk
            final_response = {
                "model": model_name,
                "created_at": created_at,
                "message": {
                    "role": "assistant",
                    "content": ""
                },
                "done": True,
                "total_duration": int(time.time() * 1e9),
                "prompt_eval_count": len(prompt.split()),
                "eval_count": max_tokens
            }
            yield f"data: {json.dumps(final_response)}\n\n"
        else:
            # Non-streaming response
            full_response = ""
            for chunk in run_llama_generation(
                model_path, prompt, max_tokens, temperature,
                top_p, top_k, repeat_penalty, seed, stream=False
            ):
                full_response += chunk
            
            yield json.dumps({
                "model": model_name,
                "created_at": created_at,
                "message": {
                    "role": "assistant",
                    "content": full_response
                },
                "done": True
            })
    
    if stream:
        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )
    else:
        return Response(
            generate(),
            mimetype='application/json'
        )

@app.route('/api/generate', methods=['POST'])
def generate():
    """Generate endpoint (Ollama compatible)"""
    data = request.get_json()
    model_name = data.get('model', '')
    prompt = data.get('prompt', '')
    stream = data.get('stream', True)
    
    # Get options
    options = data.get('options', {})
    temperature = options.get('temperature', 0.7)
    top_p = options.get('top_p', 0.9)
    top_k = options.get('top_k', 40)
    repeat_penalty = options.get('repeat_penalty', 1.1)
    seed = options.get('seed')
    max_tokens = options.get('num_predict', DEFAULT_MAX_TOKENS)
    
    # Get model path
    model_path = get_model_path(model_name)
    if not model_path:
        return jsonify({"error": f"Model {model_name} not found"}), 404
    
    logger.info(f"Generate request - Model: {model_name}, Prompt length: {len(prompt)}")
    
    def generate_response():
        created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        if stream:
            # Stream each token/chunk
            for chunk in run_llama_generation(
                model_path, prompt, max_tokens, temperature,
                top_p, top_k, repeat_penalty, seed, stream=True
            ):
                response = {
                    "model": model_name,
                    "created_at": created_at,
                    "response": chunk,
                    "done": False
                }
                yield f"data: {json.dumps(response)}\n\n"
            
            # Send final chunk
            final_response = {
                "model": model_name,
                "created_at": created_at,
                "response": "",
                "done": True
            }
            yield f"data: {json.dumps(final_response)}\n\n"
        else:
            # Non-streaming response
            full_response = ""
            for chunk in run_llama_generation(
                model_path, prompt, max_tokens, temperature,
                top_p, top_k, repeat_penalty, seed, stream=False
            ):
                full_response += chunk
            
            yield json.dumps({
                "model": model_name,
                "created_at": created_at,
                "response": full_response,
                "done": True
            })
    
    if stream:
        return Response(
            stream_with_context(generate_response()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )
    else:
        return Response(
            generate_response(),
            mimetype='application/json'
        )

@app.route('/api/pull', methods=['POST'])
def pull_model():
    """Pull model endpoint (returns success for existing models)"""
    data = request.get_json()
    model_name = data.get('name', '')
    
    # For embedding models, just return success
    if 'embed' in model_name.lower() or 'minilm' in model_name.lower():
        return jsonify({
            "status": "success",
            "digest": hashlib.sha256(model_name.encode()).hexdigest()[:12],
            "note": "Embedding model simulated for compatibility"
        })
    
    model_path = get_model_path(model_name)
    if model_path:
        return jsonify({
            "status": "success",
            "digest": hashlib.sha256(model_name.encode()).hexdigest()[:12]
        })
    else:
        return jsonify({"error": f"Model {model_name} not found. Please download it first."}), 404

@app.route('/api/embeddings', methods=['POST'])
def generate_embeddings():
    """Embeddings endpoint (stub for compatibility)"""
    data = request.get_json()
    prompt = data.get('prompt', '')
    
    # Return dummy embeddings for compatibility
    import random
    embedding = [random.random() for _ in range(384)]
    
    return jsonify({
        "embedding": embedding
    })

@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "gpu_enabled": True,
        "gpu_layers": DEFAULT_GPU_LAYERS,
        "models_available": len(set(MODEL_REGISTRY.values())) if MODEL_REGISTRY else 0
    })

if __name__ == '__main__':
    import atexit
    import signal
    
    try:
        logger.info("="*60)
        logger.info("Starting Ollama GPU Bridge v2")
        logger.info("="*60)
        
        # Check environment
        logger.info(f"Python version: {sys.version}")
        logger.info(f"Working directory: {os.getcwd()}")
        logger.info(f"Models directory: {MODELS_DIR}")
        logger.info(f"llama.cpp binary: {LLAMA_BIN}")
        logger.info(f"GPU layers: {DEFAULT_GPU_LAYERS}")
        
        # Check if binary is executable
        if not os.access(LLAMA_BIN, os.X_OK):
            logger.error(f"Binary not executable: {LLAMA_BIN}")
            sys.exit(1)
        
        # Initial model scan
        logger.info("Scanning for models...")
        scan_models()
        
        if not MODEL_REGISTRY:
            logger.warning("No models found in registry!")
            logger.warning(f"Check models directory: {MODELS_DIR}")
        else:
            logger.info(f"Found {len(set(MODEL_REGISTRY.values()))} unique models")
            model_names = list(MODEL_REGISTRY.keys())
            logger.info(f"Sample model names: {model_names[:5]}")
        
        logger.info(f"Starting server on http://127.0.0.1:11434")
        
        # Run server
        app.run(host='127.0.0.1', port=11434, debug=False, threaded=True, use_reloader=False)
        
    except Exception as e:
        logger.error(f"Failed to start GPU bridge: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)