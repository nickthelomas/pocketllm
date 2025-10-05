#!/data/data/com.termux/files/usr/bin/bash
# Start the Ollama GPU Bridge server

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     PocketLLM - Ollama GPU Bridge Server        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python3 not found!${NC}"
    echo "Installing Python..."
    pkg install -y python python-pip
fi

# Check for required Python packages
echo -e "${YELLOW}Checking Python dependencies...${NC}"
pip_packages="flask flask-cors"
for package in $pip_packages; do
    if ! python3 -c "import $package" 2>/dev/null; then
        echo "Installing $package..."
        pip install $package
    fi
done

# Check if llama.cpp is compiled
if [ ! -f "$HOME/llama.cpp/build/bin/main" ]; then
    echo -e "${RED}✗ llama.cpp not found!${NC}"
    echo "Please run: bash scripts/termux-gpu-setup.sh"
    exit 1
fi

# Check for models
MODELS_DIR="$HOME/PocketLLM/models"
if [ -z "$(ls -A $MODELS_DIR/*.gguf 2>/dev/null)" ]; then
    echo -e "${YELLOW}No models found!${NC}"
    echo "Download TinyLlama for testing:"
    echo "  bash scripts/download-tinyllama.sh"
    echo ""
    read -p "Continue anyway? (y/n): " choice
    if [ "$choice" != "y" ]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ Found models:${NC}"
    for model in "$MODELS_DIR"/*.gguf; do
        echo "  - $(basename $model)"
    done
fi

# Stop any existing Ollama service
echo -e "\n${YELLOW}Stopping Ollama service (if running)...${NC}"
pkill -f "ollama serve" 2>/dev/null || true

# Export GPU configuration
if [ -f "$HOME/.ollama/environment" ]; then
    echo -e "${GREEN}✓ Loading GPU configuration${NC}"
    source "$HOME/.ollama/environment"
    
    # Export for llama.cpp
    export LLAMA_CUDA_FORCE=1
    export CUDA_VISIBLE_DEVICES=0
fi

# Start the bridge server
echo -e "\n${GREEN}Starting GPU Bridge on port 11434...${NC}"
echo -e "${YELLOW}The web GUI will connect to this instead of Ollama${NC}"
echo -e "${BLUE}Press Ctrl+C to stop${NC}\n"

# Run the bridge server
cd "$HOME/PocketLLM"
python3 scripts/ollama-gpu-bridge.py