#!/data/data/com.termux/files/usr/bin/bash
# Quick GPU Chat Interface for PocketLLM

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

LLAMA_BIN="$HOME/llama.cpp/build/bin"
MODELS_DIR="$HOME/PocketLLM/models"

# Check if llama.cpp exists
if [ ! -f "$LLAMA_BIN/main" ]; then
    echo -e "${RED}✗ llama.cpp not found!${NC}"
    echo "Run: bash scripts/termux-gpu-setup.sh"
    exit 1
fi

# Find first available model
MODEL=$(ls "$MODELS_DIR"/*.gguf 2>/dev/null | head -1)

if [ -z "$MODEL" ]; then
    echo -e "${YELLOW}No models found!${NC}"
    echo "Run: bash scripts/llama-direct.sh"
    echo "Then select option 2 to download a model"
    exit 1
fi

# GPU layers based on model size
MODEL_SIZE=$(du -m "$MODEL" | cut -f1)
if [ $MODEL_SIZE -lt 1000 ]; then
    GPU_LAYERS=24  # Small model, use more layers
elif [ $MODEL_SIZE -lt 2000 ]; then
    GPU_LAYERS=16  # Medium model
else
    GPU_LAYERS=8   # Large model, conservative
fi

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         PocketLLM GPU Chat (Direct Mode)        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Model:${NC} $(basename $MODEL)"
echo -e "${GREEN}GPU Layers:${NC} $GPU_LAYERS"
echo -e "${GREEN}Threads:${NC} $(nproc)"
echo ""
echo -e "${YELLOW}Type /exit to quit, /reset to clear context${NC}"
echo ""

# Start interactive chat with GPU
"$LLAMA_BIN/main" \
    -m "$MODEL" \
    -ngl $GPU_LAYERS \
    -t $(nproc) \
    -c 4096 \
    -n -1 \
    --interactive \
    --interactive-first \
    --color \
    --simple-io \
    --in-prefix " [User]: " \
    --in-suffix " [Assistant]: " \
    -r "[User]:" \
    -p "You are PocketLLM, a helpful AI assistant running locally with GPU acceleration on this Android device.

[User]: "