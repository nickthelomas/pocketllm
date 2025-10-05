#!/data/data/com.termux/files/usr/bin/bash
# Quick download script for TinyLlama - the fastest model for testing GPU

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

MODELS_DIR="$HOME/PocketLLM/models"
mkdir -p "$MODELS_DIR"

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Quick Model Download - TinyLlama 1.1B       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "This will download TinyLlama 1.1B (Q4_K_M - 640MB)"
echo "Perfect for testing GPU acceleration!"
echo ""

# Download TinyLlama
URL="https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
FILENAME="tinyllama-1.1b-chat-q4_k_m.gguf"

if [ -f "$MODELS_DIR/$FILENAME" ]; then
    echo -e "${GREEN}✓ Model already exists!${NC}"
else
    echo -e "${YELLOW}Downloading TinyLlama...${NC}"
    
    if command -v wget &> /dev/null; then
        wget -c -O "$MODELS_DIR/$FILENAME" "$URL"
    elif command -v curl &> /dev/null; then
        curl -L -C - -o "$MODELS_DIR/$FILENAME" "$URL"
    else
        echo -e "${RED}Please install wget: pkg install wget${NC}"
        exit 1
    fi
    
    if [ -f "$MODELS_DIR/$FILENAME" ]; then
        echo -e "${GREEN}✓ Download complete!${NC}"
    else
        echo -e "${RED}✗ Download failed${NC}"
        exit 1
    fi
fi

# Quick test
echo -e "\n${BLUE}Testing GPU acceleration...${NC}"

LLAMA_BIN="$HOME/llama.cpp/build/bin"
if [ -f "$LLAMA_BIN/main" ]; then
    echo "Running quick benchmark..."
    time "$LLAMA_BIN/main" \
        -m "$MODELS_DIR/$FILENAME" \
        -ngl 24 \
        -t $(nproc) \
        -n 30 \
        -p "Count from 1 to 5:" \
        2>&1 | tail -20
    
    echo -e "\n${GREEN}✓ Ready to use!${NC}"
    echo -e "${BLUE}Start chatting:${NC} bash scripts/chat-gpu.sh"
    echo -e "${BLUE}More options:${NC} bash scripts/llama-direct.sh"
else
    echo -e "${YELLOW}llama.cpp not found. Run: bash scripts/termux-gpu-setup.sh${NC}"
fi