#!/data/data/com.termux/files/usr/bin/bash
# PocketLLM Termux Startup Script with GPU Bridge
# This script starts the GPU-accelerated Ollama bridge and PocketLLM server

echo "======================================"
echo "PocketLLM Startup Script"
echo "======================================"
echo ""

# Check if storage permission is granted
if [ ! -d "$HOME/storage" ]; then
    echo "⚠️  Storage access not configured!"
    echo "Please run: termux-setup-storage"
    echo "Then restart this script"
    exit 1
fi

# Scan Downloads folder for GGUF models
DOWNLOADS_DIR="$HOME/storage/downloads"
echo "📁 Scanning Downloads folder for GGUF models..."

if [ -d "$DOWNLOADS_DIR" ]; then
    GGUF_COUNT=$(find "$DOWNLOADS_DIR" -name "*.gguf" 2>/dev/null | wc -l)
    if [ "$GGUF_COUNT" -gt 0 ]; then
        echo "✓ Found $GGUF_COUNT GGUF model(s) in Downloads"
        find "$DOWNLOADS_DIR" -name "*.gguf" -exec basename {} \; | head -5
        if [ "$GGUF_COUNT" -gt 5 ]; then
            echo "  ... and $((GGUF_COUNT - 5)) more"
        fi
    else
        echo "ℹ️  No GGUF models found in Downloads folder"
        echo "   Download models from HuggingFace to your Downloads folder"
    fi
else
    echo "❌ Cannot access Downloads folder"
    echo "   Please ensure termux-setup-storage has been run"
fi

echo ""
echo "Starting services..."
echo ""

# Kill any existing instances
pkill -f "llama-server" 2>/dev/null
pkill -f "node.*server" 2>/dev/null
sleep 1

# GPU Bridge Configuration
GPU_LAYERS="-ngl 999"  # Offload all layers to GPU
GPU_THREADS="-t 4"     # Number of CPU threads
CONTEXT_SIZE="-c 4096" # Context window size

# Start GPU Bridge (llama.cpp server mimicking Ollama API)
echo "🚀 Starting GPU Bridge on port 11434..."
cd ~/llama.cpp

# The GPU bridge will scan Downloads folder for models
./llama-server \
    --port 11434 \
    --host 0.0.0.0 \
    $GPU_LAYERS \
    $GPU_THREADS \
    $CONTEXT_SIZE \
    --models-path "$DOWNLOADS_DIR" \
    --log-disable &

GPU_PID=$!
echo "GPU Bridge PID: $GPU_PID"

# Wait for GPU bridge to be ready
echo "Waiting for GPU bridge..."
for i in {1..10}; do
    if curl -s http://localhost:11434/health > /dev/null 2>&1; then
        echo "✅ GPU Bridge is ready!"
        break
    fi
    sleep 1
done

# Start PocketLLM server
echo ""
echo "🚀 Starting PocketLLM server on port 5000..."
cd ~/PocketLLM

# Set environment to use GPU bridge
export OLLAMA_BASE_URL="http://localhost:11434"
export NODE_ENV="production"
export PORT=5000
export DATABASE_URL="postgresql://user:pass@localhost/pocketllm"

# Start the Node.js server
npm start &
SERVER_PID=$!
echo "PocketLLM Server PID: $SERVER_PID"

# Wait for server to be ready
echo "Waiting for PocketLLM server..."
for i in {1..15}; do
    if curl -s http://localhost:5000 > /dev/null 2>&1; then
        echo "✅ PocketLLM server is ready!"
        break
    fi
    sleep 1
done

echo ""
echo "======================================"
echo "✅ PocketLLM is running!"
echo "======================================"
echo ""
echo "📱 Access from this device:"
echo "   http://localhost:5000"
echo ""
echo "🌐 Access from other devices on same network:"
ip_addr=$(ip addr show wlan0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1)
if [ -z "$ip_addr" ]; then
    ip_addr=$(hostname -I | awk '{print $1}')
fi
echo "   http://$ip_addr:5000"
echo ""
echo "📚 Model Management:"
echo "   - Download GGUF models to your Downloads folder"
echo "   - Click 'Refresh' in the web UI to scan for new models"
echo "   - Models are used directly from Downloads (no copying needed)"
echo ""
echo "⚡ GPU Acceleration: ENABLED"
echo "   All layers offloaded to GPU for maximum performance"
echo ""
echo "Press Ctrl+C to stop all services"
echo "======================================"

# Keep script running and handle shutdown
trap "echo 'Shutting down...'; kill $GPU_PID $SERVER_PID 2>/dev/null; exit" INT TERM

# Keep the script running
while true; do
    sleep 1
    
    # Check if processes are still running
    if ! kill -0 $GPU_PID 2>/dev/null; then
        echo "⚠️  GPU Bridge stopped unexpectedly. Restarting..."
        cd ~/llama.cpp
        ./llama-server \
            --port 11434 \
            --host 0.0.0.0 \
            $GPU_LAYERS \
            $GPU_THREADS \
            $CONTEXT_SIZE \
            --models-path "$DOWNLOADS_DIR" \
            --log-disable &
        GPU_PID=$!
    fi
    
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "⚠️  PocketLLM server stopped unexpectedly. Restarting..."
        cd ~/PocketLLM
        npm start &
        SERVER_PID=$!
    fi
done