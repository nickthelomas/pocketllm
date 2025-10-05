#!/data/data/com.termux/files/usr/bin/bash
# PocketLLM Direct llama.cpp Runner with GPU Acceleration
# Bypasses Ollama to use GPU-compiled llama.cpp directly

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
LLAMA_BIN="$HOME/llama.cpp/build/bin"
MODELS_DIR="$HOME/PocketLLM/models"
DEFAULT_GPU_LAYERS=16
DEFAULT_THREADS=$(nproc)

# Create models directory if it doesn't exist
mkdir -p "$MODELS_DIR"

# Function to display header
show_header() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      PocketLLM Direct GPU Runner (llama.cpp)    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Function to check if llama.cpp is compiled
check_llama_cpp() {
    if [ ! -f "$LLAMA_BIN/main" ]; then
        echo -e "${RED}✗ llama.cpp not found!${NC}"
        echo "Please run: bash scripts/termux-gpu-setup.sh"
        exit 1
    fi
    echo -e "${GREEN}✓ llama.cpp found${NC}"
}

# Function to list available models
list_models() {
    echo -e "\n${BLUE}Available Models:${NC}"
    if [ -z "$(ls -A $MODELS_DIR 2>/dev/null)" ]; then
        echo "  No models found in $MODELS_DIR"
        echo "  Use option 2 to download models"
    else
        local i=1
        for model in "$MODELS_DIR"/*.gguf; do
            if [ -f "$model" ]; then
                local size=$(du -h "$model" | cut -f1)
                local name=$(basename "$model")
                echo "  $i) $name ($size)"
                ((i++))
            fi
        done
    fi
}

# Function to download popular models
download_model() {
    echo -e "\n${BLUE}Download Mobile-Optimized Models:${NC}"
    echo "1) Llama 3.2 1B (Q4_K_M) - 0.7GB - Fastest, good quality"
    echo "2) Phi-3 Mini (Q4_K_M) - 2.2GB - Excellent for coding"
    echo "3) Gemma 2B (Q4_K_M) - 1.4GB - Good general purpose"
    echo "4) TinyLlama 1.1B (Q4_K_M) - 0.6GB - Ultra fast"
    echo "5) Qwen 1.8B (Q4_K_M) - 1.1GB - Multi-language support"
    echo "6) Custom URL"
    echo "0) Back to main menu"
    
    read -p "Select model to download: " choice
    
    local url=""
    local filename=""
    
    case $choice in
        1)
            url="https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
            filename="llama-3.2-1b-instruct-q4_k_m.gguf"
            ;;
        2)
            url="https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf"
            filename="phi-3-mini-q4_k_m.gguf"
            ;;
        3)
            url="https://huggingface.co/google/gemma-2b-it-GGUF/resolve/main/gemma-2b-it-q4_k_m.gguf"
            filename="gemma-2b-q4_k_m.gguf"
            ;;
        4)
            url="https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
            filename="tinyllama-1.1b-q4_k_m.gguf"
            ;;
        5)
            url="https://huggingface.co/Qwen/Qwen1.5-1.8B-Chat-GGUF/resolve/main/qwen1_5-1_8b-chat-q4_k_m.gguf"
            filename="qwen-1.8b-q4_k_m.gguf"
            ;;
        6)
            read -p "Enter GGUF URL: " url
            read -p "Enter filename: " filename
            ;;
        0)
            return
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            return
            ;;
    esac
    
    if [ -n "$url" ]; then
        echo -e "\n${YELLOW}Downloading $filename...${NC}"
        echo "This may take a few minutes depending on your connection"
        
        if command -v wget &> /dev/null; then
            wget -c -O "$MODELS_DIR/$filename" "$url"
        elif command -v curl &> /dev/null; then
            curl -L -C - -o "$MODELS_DIR/$filename" "$url"
        else
            echo -e "${RED}Neither wget nor curl found. Install with: pkg install wget${NC}"
            return
        fi
        
        if [ -f "$MODELS_DIR/$filename" ]; then
            echo -e "${GREEN}✓ Model downloaded successfully!${NC}"
        else
            echo -e "${RED}✗ Download failed${NC}"
        fi
    fi
}

# Function to run model with GPU
run_model() {
    list_models
    
    # Get model list
    local models=("$MODELS_DIR"/*.gguf)
    if [ ! -f "${models[0]}" ]; then
        echo -e "\n${RED}No models available. Please download one first.${NC}"
        return
    fi
    
    echo ""
    read -p "Select model number (or 0 to cancel): " model_num
    
    if [ "$model_num" = "0" ]; then
        return
    fi
    
    # Get selected model
    local i=1
    local selected_model=""
    for model in "${models[@]}"; do
        if [ -f "$model" ] && [ "$i" = "$model_num" ]; then
            selected_model="$model"
            break
        fi
        ((i++))
    done
    
    if [ -z "$selected_model" ]; then
        echo -e "${RED}Invalid selection${NC}"
        return
    fi
    
    echo -e "\n${BLUE}GPU Configuration:${NC}"
    read -p "GPU layers (default $DEFAULT_GPU_LAYERS, max 32): " gpu_layers
    gpu_layers=${gpu_layers:-$DEFAULT_GPU_LAYERS}
    
    read -p "CPU threads (default $DEFAULT_THREADS): " threads
    threads=${threads:-$DEFAULT_THREADS}
    
    echo -e "\n${BLUE}Mode:${NC}"
    echo "1) Interactive chat"
    echo "2) Single prompt"
    echo "3) Benchmark (test performance)"
    
    read -p "Select mode: " mode
    
    case $mode in
        1)
            echo -e "\n${GREEN}Starting interactive chat with GPU acceleration...${NC}"
            echo -e "${YELLOW}Commands: /exit to quit, /reset to clear context${NC}\n"
            
            "$LLAMA_BIN/main" \
                -m "$selected_model" \
                -ngl $gpu_layers \
                -t $threads \
                -c 4096 \
                -n -1 \
                --interactive \
                --interactive-first \
                --color \
                --simple-io \
                -r "User:" \
                -p "You are a helpful AI assistant. Please provide clear and concise responses.

User: "
            ;;
        2)
            read -p "Enter prompt: " prompt
            
            echo -e "\n${GREEN}Running with GPU acceleration...${NC}\n"
            time "$LLAMA_BIN/main" \
                -m "$selected_model" \
                -ngl $gpu_layers \
                -t $threads \
                -c 2048 \
                -n 256 \
                -p "$prompt"
            ;;
        3)
            echo -e "\n${GREEN}Running performance benchmark...${NC}"
            echo "Testing with standard prompt..."
            
            # Run benchmark
            start_time=$(date +%s%N)
            output=$("$LLAMA_BIN/main" \
                -m "$selected_model" \
                -ngl $gpu_layers \
                -t $threads \
                -c 512 \
                -n 50 \
                -p "Count from 1 to 10:" 2>&1)
            end_time=$(date +%s%N)
            
            # Calculate metrics
            elapsed=$(( (end_time - start_time) / 1000000 ))
            
            echo "$output"
            echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
            echo -e "${CYAN}Performance Results:${NC}"
            echo -e "  Total time: ${elapsed}ms"
            
            # Extract token/s if available
            if echo "$output" | grep -q "tokens/s"; then
                tokens_per_sec=$(echo "$output" | grep -oP '\d+\.\d+ tokens/s' | head -1)
                echo -e "  Speed: ${GREEN}$tokens_per_sec${NC}"
            fi
            
            # Performance assessment
            if [ $elapsed -lt 3000 ]; then
                echo -e "  ${GREEN}✓ Excellent! GPU acceleration is working${NC}"
            elif [ $elapsed -lt 8000 ]; then
                echo -e "  ${YELLOW}⚠ Moderate performance${NC}"
            else
                echo -e "  ${RED}✗ Slow - check GPU settings${NC}"
            fi
            echo -e "${CYAN}═══════════════════════════════════════${NC}"
            ;;
        *)
            echo -e "${RED}Invalid mode${NC}"
            ;;
    esac
}

# Function to show GPU info
show_gpu_info() {
    echo -e "\n${BLUE}GPU Configuration Status:${NC}"
    
    # Check if GPU config exists
    if [ -f "$HOME/.ollama/environment" ]; then
        echo -e "${GREEN}✓ GPU config found:${NC}"
        grep -E "GPU_LAYERS|NUM_GPU" "$HOME/.ollama/environment" | sed 's/^/  /'
    else
        echo -e "${YELLOW}⚠ No Ollama GPU config (not needed for direct mode)${NC}"
    fi
    
    # Check llama.cpp compilation
    echo -e "\n${BLUE}llama.cpp build info:${NC}"
    if [ -f "$LLAMA_BIN/main" ]; then
        echo -e "${GREEN}✓ Binary exists${NC}"
        
        # Try to detect GPU support
        if ldd "$LLAMA_BIN/main" 2>/dev/null | grep -q "vulkan\|opencl"; then
            echo -e "${GREEN}✓ GPU libraries linked${NC}"
        else
            echo -e "${YELLOW}⚠ GPU library status unclear${NC}"
        fi
    fi
    
    # Show device info
    echo -e "\n${BLUE}Device:${NC}"
    echo "  Model: $(getprop ro.product.model)"
    echo "  Platform: $(getprop ro.board.platform)"
    echo "  CPUs: $(nproc)"
    echo "  RAM: $(free -h | awk '/^Mem:/ {print $2}')"
}

# Main menu
main_menu() {
    while true; do
        show_header
        echo -e "${BLUE}Main Menu:${NC}"
        echo "1) Run model with GPU"
        echo "2) Download models"
        echo "3) List available models"
        echo "4) Show GPU info"
        echo "5) Quick benchmark"
        echo "0) Exit"
        echo ""
        
        read -p "Select option: " choice
        
        case $choice in
            1)
                run_model
                ;;
            2)
                download_model
                ;;
            3)
                list_models
                echo -e "\n${YELLOW}Press Enter to continue${NC}"
                read
                ;;
            4)
                show_gpu_info
                echo -e "\n${YELLOW}Press Enter to continue${NC}"
                read
                ;;
            5)
                # Quick test with smallest available model
                if [ -f "$MODELS_DIR"/*.gguf ]; then
                    first_model=$(ls "$MODELS_DIR"/*.gguf | head -1)
                    echo -e "\n${GREEN}Quick benchmark with $(basename $first_model)${NC}"
                    time "$LLAMA_BIN/main" \
                        -m "$first_model" \
                        -ngl 16 \
                        -t $(nproc) \
                        -n 20 \
                        -p "Hello"
                else
                    echo -e "${RED}No models found. Download one first.${NC}"
                fi
                echo -e "\n${YELLOW}Press Enter to continue${NC}"
                read
                ;;
            0)
                echo -e "${GREEN}Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                sleep 1
                ;;
        esac
        
        echo ""
    done
}

# Check prerequisites
check_llama_cpp

# Start main menu
main_menu