#!/data/data/com.termux/files/usr/bin/bash
# Start PocketLLM with GPU-accelerated Ollama bridge
# This replaces the standard termux-start.sh when using GPU mode

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PROJECT_DIR="$HOME/PocketLLM"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/pids"

# Create necessary directories
mkdir -p "$LOG_DIR" "$PID_DIR"

# Function to display header
show_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     PocketLLM - GPU Accelerated Mode            ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check llama.cpp (handle both main and llama-cli)
    if [ -f "$HOME/llama.cpp/build/bin/main" ]; then
        echo -e "${GREEN}✓ llama.cpp found (main)${NC}"
    elif [ -f "$HOME/llama.cpp/build/bin/llama-cli" ]; then
        echo -e "${GREEN}✓ llama.cpp found (llama-cli)${NC}"
        # Create symlink for compatibility
        if [ ! -f "$HOME/llama.cpp/build/bin/main" ]; then
            ln -sf "$HOME/llama.cpp/build/bin/llama-cli" "$HOME/llama.cpp/build/bin/main"
            echo -e "${YELLOW}  Created symlink: main -> llama-cli${NC}"
        fi
    else
        echo -e "${RED}✗ llama.cpp not found${NC}"
        echo "Run: bash scripts/termux-gpu-setup.sh"
        return 1
    fi
    
    # Check for models
    if [ -z "$(ls -A $PROJECT_DIR/models/*.gguf 2>/dev/null)" ]; then
        echo -e "${YELLOW}⚠ No models found${NC}"
        echo "Download TinyLlama: bash scripts/download-tinyllama.sh"
    else
        echo -e "${GREEN}✓ Models available${NC}"
    fi
    
    # Check Python packages
    if ! python3 -c "import flask" 2>/dev/null; then
        echo -e "${YELLOW}Installing Flask...${NC}"
        pip install flask flask-cors
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}✗ Node.js not found${NC}"
        echo "Installing Node.js..."
        pkg install nodejs-lts -y
    fi
    echo -e "${GREEN}✓ Node.js installed${NC}"
    
    return 0
}

# Function to stop services
stop_services() {
    echo -e "\n${YELLOW}Stopping existing services...${NC}"
    
    # Stop Ollama (if running)
    pkill -f "ollama serve" 2>/dev/null && echo "  - Stopped Ollama"
    
    # Stop GPU bridge
    pkill -f "ollama-gpu-bridge-v2.py" 2>/dev/null && echo "  - Stopped GPU bridge"
    
    # Stop backend
    pkill -f "npm run dev" 2>/dev/null && echo "  - Stopped backend"
    
    sleep 2
}

# Function to start GPU bridge
start_gpu_bridge() {
    echo -e "\n${BLUE}Starting GPU Bridge Server...${NC}"
    
    # Export GPU settings if available
    if [ -f "$HOME/.ollama/environment" ]; then
        source "$HOME/.ollama/environment"
        echo -e "${GREEN}✓ GPU configuration loaded${NC}"
        echo "  GPU Layers: ${OLLAMA_GPU_LAYERS:-16}"
        echo "  Threads: $(nproc)"
    fi
    
    # Start the bridge in background (v2 - simplified version)
    cd "$PROJECT_DIR"
    nohup python3 scripts/ollama-gpu-bridge-v2.py \
        > "$LOG_DIR/gpu-bridge.log" 2>&1 &
    
    echo $! > "$PID_DIR/gpu-bridge.pid"
    
    # Wait for bridge to be ready
    echo -n "Waiting for GPU bridge..."
    for i in {1..10}; do
        if curl -s http://127.0.0.1:11434/health >/dev/null 2>&1; then
            echo -e " ${GREEN}ready!${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo -e " ${RED}failed!${NC}"
    echo "Check logs: tail -f $LOG_DIR/gpu-bridge.log"
    return 1
}

# Function to start backend
start_backend() {
    echo -e "\n${BLUE}Starting PocketLLM Backend...${NC}"
    
    cd "$PROJECT_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    
    # Set environment to use local bridge instead of Ollama
    export OLLAMA_HOST="http://127.0.0.1:11434"
    
    # Start the backend
    nohup npm run dev > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"
    
    # Wait for backend to be ready
    echo -n "Waiting for backend..."
    for i in {1..15}; do
        if curl -s http://localhost:5000/api/health >/dev/null 2>&1; then
            echo -e " ${GREEN}ready!${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo -e " ${YELLOW}taking longer than expected${NC}"
    echo "Check logs: tail -f $LOG_DIR/backend.log"
    return 0
}

# Function to show status
show_status() {
    echo -e "\n${CYAN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ PocketLLM is running with GPU acceleration!${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Access Points:${NC}"
    echo -e "  Web UI:      ${GREEN}http://localhost:5000${NC}"
    echo -e "  GPU Bridge:  ${GREEN}http://localhost:11434${NC}"
    echo ""
    echo -e "${BLUE}Quick Actions:${NC}"
    echo -e "  Chat:        ${YELLOW}bash scripts/chat-gpu.sh${NC}"
    echo -e "  Monitor:     ${YELLOW}bash scripts/monitor.sh${NC}"
    echo -e "  Logs:        ${YELLOW}tail -f logs/gpu-bridge.log${NC}"
    echo ""
    echo -e "${BLUE}Management:${NC}"
    echo -e "  Stop all:    ${YELLOW}bash termux-stop.sh${NC}"
    echo -e "  Restart:     ${YELLOW}bash termux-start-gpu.sh${NC}"
    echo ""
    echo -e "${CYAN}Press Ctrl+C to stop all services${NC}"
}

# Function to monitor services
monitor_services() {
    trap 'echo -e "\n${YELLOW}Stopping services...${NC}"; stop_services; exit 0' INT TERM
    
    while true; do
        # Check if services are running
        if ! pgrep -f "ollama-gpu-bridge-v2.py" > /dev/null; then
            echo -e "\n${RED}GPU Bridge stopped! Restarting...${NC}"
            start_gpu_bridge
        fi
        
        if ! pgrep -f "npm run dev" > /dev/null; then
            echo -e "\n${RED}Backend stopped! Restarting...${NC}"
            start_backend
        fi
        
        sleep 5
    done
}

# Main execution
main() {
    show_header
    
    if ! check_prerequisites; then
        echo -e "\n${RED}Prerequisites check failed!${NC}"
        exit 1
    fi
    
    stop_services
    
    if ! start_gpu_bridge; then
        echo -e "\n${RED}Failed to start GPU bridge!${NC}"
        exit 1
    fi
    
    if ! start_backend; then
        echo -e "\n${YELLOW}Backend may not be fully started${NC}"
    fi
    
    show_status
    
    # Keep services running
    monitor_services
}

# Run main function
main