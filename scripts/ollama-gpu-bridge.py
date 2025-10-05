#!/data/data/com.termux/files/usr/bin/python3
"""
Ollama-compatible API bridge for llama.cpp with GPU acceleration
Provides the same API endpoints as Ollama but uses llama.cpp directly
"""

import os
import sys
import json
import time
import subprocess
import threading
import queue
import hashlib
import traceback
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
DEFAULT_GPU_LAYERS = 16
DEFAULT_THREADS = os.cpu_count() or 4
DEFAULT_CONTEXT = 4096

# Model registry (maps Ollama model names to GGUF files)
MODEL_REGISTRY = {}
ACTIVE_SESSIONS = {}

class LlamaCppSession:
    """Manages a llama.cpp process for a specific model"""
    
    def __init__(self, model_path: str, gpu_layers: int = DEFAULT_GPU_LAYERS):
        self.model_path = model_path
        self.gpu_layers = gpu_layers
        self.process = None
        self.input_queue = queue.Queue()
        self.output_queue = queue.Queue()
        self.context = []
        
    def start(self):
        """Start the llama.cpp process"""
        if self.process:
            return
            
        cmd = [
            str(LLAMA_BIN),
            "-m", self.model_path,
            "-ngl", str(self.gpu_layers),
            "-t", str(DEFAULT_THREADS),
            "-c", str(DEFAULT_CONTEXT),
            "--interactive",
            "--interactive-first",
            "--simple-io",
            "-n", "512",
            "--temp", "0.7",
            "--top-p", "0.9",
            "--top-k", "40",
            "--repeat-penalty", "1.1",
        ]
        
        logger.info(f"Starting llama.cpp with: {' '.join(cmd)}")
        
        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # Start output reader thread
        self.reader_thread = threading.Thread(target=self._read_output)
        self.reader_thread.daemon = True
        self.reader_thread.start()
        
    def _read_output(self):
        """Read output from llama.cpp process"""
        while self.process and self.process.poll() is None:
            try:
                line = self.process.stdout.readline()
                if line:
                    self.output_queue.put(line.rstrip())
            except Exception as e:
                logger.error(f"Error reading output: {e}")
                break
                
    def generate(self, prompt: str, stream: bool = True) -> Generator[str, None, None]:
        """Generate response from prompt"""
        if not self.process:
            self.start()
            time.sleep(1)  # Give process time to initialize
            
        # Clear any pending output
        while not self.output_queue.empty():
            self.output_queue.get_nowait()
            
        # Send prompt
        self.process.stdin.write(prompt + "\n")
        self.process.stdin.flush()
        
        # Collect response
        response_lines = []
        empty_line_count = 0
        start_time = time.time()
        
        while True:
            try:
                line = self.output_queue.get(timeout=0.1)
                
                # Skip echo of prompt
                if line.strip() == prompt.strip():
                    continue
                    
                # Check for completion patterns
                if not line:
                    empty_line_count += 1
                    if empty_line_count > 2:
                        break
                else:
                    empty_line_count = 0
                    response_lines.append(line)
                    
                    if stream:
                        yield line + "\n"
                        
                # Timeout after 30 seconds
                if time.time() - start_time > 30:
                    break
                    
            except queue.Empty:
                # Check if we've received any response
                if response_lines and time.time() - start_time > 2:
                    break
                continue
                
        if not stream:
            yield "\n".join(response_lines)
            
    def stop(self):
        """Stop the llama.cpp process"""
        if self.process:
            self.process.terminate()
            self.process.wait()
            self.process = None

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
        # 1. Full filename
        MODEL_REGISTRY[filename] = path_str
        
        # 2. Stem (without .gguf)
        MODEL_REGISTRY[stem] = path_str
        MODEL_REGISTRY[stem_lower] = path_str
        
        # 3. Simplified names (replace dashes and dots)
        simple_name = stem_lower.replace("-", "_").replace(".", "_")
        MODEL_REGISTRY[simple_name] = path_str
        
        # 4. Create Ollama-style names based on model type
        # Check the original filename, not the modified name
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
            elif "3b" in stem_lower:
                MODEL_REGISTRY["llama3:3b"] = path_str
            elif "7b" in stem_lower or "8b" in stem_lower:
                MODEL_REGISTRY["llama3:8b"] = path_str
                
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
    for name, path in MODEL_REGISTRY.items():
        logger.debug(f"  {name} -> {Path(path).name}")

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
        
    # Try with various transformations
    # Replace spaces with dashes or underscores
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
            
    # Try partial matches for common patterns
    # This helps when UI sends variations of model names
    for key, path in MODEL_REGISTRY.items():
        # Check if the model_name is a substring of a registered key
        if model_name.lower() in key.lower() or key.lower() in model_name.lower():
            logger.info(f"Partial match: {model_name} -> {key} -> {path}")
            return path
            
    # If still not found, check if it's a direct file path
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

def get_or_create_session(model_name: str) -> Optional[LlamaCppSession]:
    """Get or create a session for a model"""
    model_path = get_model_path(model_name)
    if not model_path:
        return None
        
    if model_name not in ACTIVE_SESSIONS:
        session = LlamaCppSession(model_path)
        session.start()
        ACTIVE_SESSIONS[model_name] = session
        
    return ACTIVE_SESSIONS[model_name]

# API Routes

@app.route('/api/tags', methods=['GET'])
@app.route('/api/models', methods=['GET'])
def list_models():
    """List available models (Ollama compatible)"""
    scan_models()
    
    models = []
    seen_files = {}  # Map file paths to their preferred names
    
    # First pass: collect all unique files and determine their best names
    for name, path in MODEL_REGISTRY.items():
        if path not in seen_files:
            # Prefer Ollama-style names (with :tag) over plain names
            if ":" in name:
                seen_files[path] = name
            elif path not in seen_files:
                seen_files[path] = name
    
    # Second pass: create model entries for each unique file
    for path, preferred_name in seen_files.items():
        model_file = Path(path)
        if model_file.exists():
            size = model_file.stat().st_size
            modified = model_file.stat().st_mtime
            
            # Determine model family and size from filename
            filename_lower = model_file.name.lower()
            family = "llama"  # default
            param_size = "1B"  # default
            
            if "tinyllama" in filename_lower:
                family = "tinyllama"
                param_size = "1.1B"
            elif "llama" in filename_lower:
                family = "llama"
                if "1b" in filename_lower:
                    param_size = "1B"
                elif "3b" in filename_lower:
                    param_size = "3B"
                elif "7b" in filename_lower or "8b" in filename_lower:
                    param_size = "8B"
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
    
    # Add fake embedding model entries so the backend thinks they're available
    # This prevents the backend from trying to pull them at startup
    models.append({
        "name": "nomic-embed-text:latest",
        "model": "nomic-embed-text:latest",
        "modified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "size": 274302450,  # Fake size
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
        "parameters": f"gpu_layers {DEFAULT_GPU_LAYERS}\nthreads {DEFAULT_THREADS}",
        "template": "{{ .Prompt }}",
        "details": {
            "format": "gguf",
            "families": ["llama"],
            "parameter_size": "1B",
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
    
    if not messages:
        return jsonify({"error": "No messages provided"}), 400
        
    # Get or create session
    session = get_or_create_session(model_name)
    if not session:
        return jsonify({"error": f"Model {model_name} not found"}), 404
        
    # Build prompt from messages
    prompt = ""
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        
        if role == 'system':
            prompt = f"{content}\n\n" + prompt
        elif role == 'user':
            prompt += f"User: {content}\nAssistant: "
        elif role == 'assistant':
            prompt += f"{content}\n"
            
    def generate():
        """Generate streaming response"""
        try:
            for chunk in session.generate(prompt, stream=True):
                response = {
                    "model": model_name,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "message": {
                        "role": "assistant",
                        "content": chunk
                    },
                    "done": False
                }
                yield f"data: {json.dumps(response)}\n\n"
                
            # Send done message
            response = {
                "model": model_name,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "done": True,
                "total_duration": 1000000000,
                "load_duration": 100000000,
                "prompt_eval_count": len(prompt.split()),
                "eval_count": 100,
                "eval_duration": 900000000
            }
            yield f"data: {json.dumps(response)}\n\n"
            
        except Exception as e:
            logger.error(f"Error during generation: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
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
        # Non-streaming response
        full_response = ""
        for chunk in session.generate(prompt, stream=False):
            full_response += chunk
            
        return jsonify({
            "model": model_name,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "message": {
                "role": "assistant",
                "content": full_response
            },
            "done": True
        })

@app.route('/api/generate', methods=['POST'])
def generate_completion():
    """Generate endpoint (Ollama compatible)"""
    data = request.get_json()
    model_name = data.get('model', '')
    prompt = data.get('prompt', '')
    stream = data.get('stream', True)
    
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
        
    # Get or create session
    session = get_or_create_session(model_name)
    if not session:
        return jsonify({"error": f"Model {model_name} not found"}), 404
        
    def generate():
        """Generate streaming response"""
        try:
            for chunk in session.generate(prompt, stream=True):
                response = {
                    "model": model_name,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "response": chunk,
                    "done": False
                }
                yield f"data: {json.dumps(response)}\n\n"
                
            # Send done message
            response = {
                "model": model_name,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "done": True,
                "context": [],
                "total_duration": 1000000000,
                "load_duration": 100000000
            }
            yield f"data: {json.dumps(response)}\n\n"
            
        except Exception as e:
            logger.error(f"Error during generation: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
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
        # Non-streaming response
        full_response = ""
        for chunk in session.generate(prompt, stream=False):
            full_response += chunk
            
        return jsonify({
            "model": model_name,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "response": full_response,
            "done": True
        })

@app.route('/api/pull', methods=['POST'])
def pull_model():
    """Pull model endpoint (returns success for existing models)"""
    data = request.get_json()
    model_name = data.get('name', '')
    
    # For embedding models, just return success
    # These models are not supported by llama.cpp but we pretend they exist
    # to prevent the backend from crashing
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
    # This is a stub - llama.cpp doesn't directly support embeddings
    # You'd need a separate embedding model for this
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
        "models_loaded": len(ACTIVE_SESSIONS),
        "models_available": len(MODEL_REGISTRY)
    })

def cleanup():
    """Cleanup active sessions"""
    logger.info("Cleaning up active sessions...")
    for session in ACTIVE_SESSIONS.values():
        session.stop()
    ACTIVE_SESSIONS.clear()

if __name__ == '__main__':
    import atexit
    import signal
    
    try:
        logger.info("="*60)
        logger.info("Starting Ollama GPU Bridge")
        logger.info("="*60)
        
        # Check environment
        logger.info(f"Python version: {sys.version}")
        logger.info(f"Working directory: {os.getcwd()}")
        logger.info(f"Models directory: {MODELS_DIR}")
        logger.info(f"llama.cpp binary: {LLAMA_BIN}")
        
        # Check if binary is executable
        if not os.access(LLAMA_BIN, os.X_OK):
            logger.error(f"Binary not executable: {LLAMA_BIN}")
            sys.exit(1)
        
        # Register cleanup
        atexit.register(cleanup)
        signal.signal(signal.SIGINT, lambda s, f: cleanup() or exit(0))
        signal.signal(signal.SIGTERM, lambda s, f: cleanup() or exit(0))
        
        # Initial model scan
        logger.info("Scanning for models...")
        scan_models()
        
        if not MODEL_REGISTRY:
            logger.warning("No models found in registry!")
            logger.warning(f"Check models directory: {MODELS_DIR}")
        else:
            logger.info(f"Found {len(set(MODEL_REGISTRY.values()))} unique models")
            logger.info(f"Model names: {list(MODEL_REGISTRY.keys())[:5]}...")
        
        logger.info(f"Starting server on http://127.0.0.1:11434")
        
        # Run server
        app.run(host='127.0.0.1', port=11434, debug=False, threaded=True, use_reloader=False)
        
    except Exception as e:
        logger.error(f"Failed to start GPU bridge: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)