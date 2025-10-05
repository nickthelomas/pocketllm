#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   PocketLLM GPU Bridge Diagnostics     ${NC}"
echo -e "${BLUE}========================================${NC}"

# Kill any existing processes
echo -e "\n${YELLOW}Stopping any existing GPU bridge processes...${NC}"
pkill -f "ollama-gpu-bridge.py" 2>/dev/null
pkill -f "main.*gguf" 2>/dev/null
sleep 2

# Check Python and required packages
echo -e "\n${BLUE}1. Checking Python setup:${NC}"
python3 --version
if python3 -c "import flask, flask_cors" 2>/dev/null; then
    echo -e "${GREEN}✓ Flask and flask-cors installed${NC}"
else
    echo -e "${RED}✗ Flask not installed${NC}"
    echo "Installing Flask..."
    pip install flask flask-cors
fi

# Check llama.cpp binary
echo -e "\n${BLUE}2. Checking llama.cpp binary:${NC}"
if [ -f "$HOME/llama.cpp/build/bin/main" ]; then
    echo -e "${GREEN}✓ main binary found${NC}"
    LLAMA_BIN="$HOME/llama.cpp/build/bin/main"
elif [ -f "$HOME/llama.cpp/build/bin/llama-cli" ]; then
    echo -e "${GREEN}✓ llama-cli binary found${NC}"
    LLAMA_BIN="$HOME/llama.cpp/build/bin/llama-cli"
else
    echo -e "${RED}✗ No llama.cpp binary found${NC}"
    exit 1
fi

# Test binary
echo -e "\n${BLUE}3. Testing llama.cpp binary:${NC}"
$LLAMA_BIN --version 2>&1 | head -2

# Check models
echo -e "\n${BLUE}4. Checking models:${NC}"
ls -la ~/PocketLLM/models/*.gguf 2>/dev/null || echo "No models found"

# Try to start the bridge with verbose output
echo -e "\n${BLUE}5. Starting GPU bridge with verbose output:${NC}"
cd ~/PocketLLM

# Create logs directory if it doesn't exist
mkdir -p logs

# Run the bridge with output visible (using v2 - simplified version)
echo -e "${YELLOW}Starting bridge v2 (press Ctrl+C to stop)...${NC}"
python3 scripts/ollama-gpu-bridge-v2.py 2>&1 | tee logs/gpu-bridge-debug.log &
BRIDGE_PID=$!

# Wait for it to start
echo -n "Waiting for bridge to start"
for i in {1..10}; do
    if curl -s http://127.0.0.1:11434/health >/dev/null 2>&1; then
        echo -e " ${GREEN}SUCCESS!${NC}"
        
        # Test the API
        echo -e "\n${BLUE}6. Testing API:${NC}"
        echo "Health check:"
        curl -s http://127.0.0.1:11434/health | python3 -m json.tool
        
        echo -e "\n${BLUE}Models list:${NC}"
        curl -s http://127.0.0.1:11434/api/tags | python3 -m json.tool | head -20
        
        # Kill the test bridge
        kill $BRIDGE_PID 2>/dev/null
        
        echo -e "\n${GREEN}✓ GPU Bridge is working!${NC}"
        echo -e "${YELLOW}You can now run: bash termux-start-gpu.sh${NC}"
        exit 0
    fi
    echo -n "."
    sleep 1
done

echo -e " ${RED}FAILED${NC}"
echo -e "\n${RED}GPU Bridge failed to start. Check the logs:${NC}"
echo "tail -50 logs/gpu-bridge-debug.log"

# Kill the bridge if still running
kill $BRIDGE_PID 2>/dev/null

exit 1