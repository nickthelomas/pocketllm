#!/data/data/com.termux/files/usr/bin/bash
# PocketLLM GPU Verification Script
# Tests if GPU acceleration is properly configured

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      PocketLLM GPU Acceleration Verifier        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Check device info
echo -e "${BLUE}1. Device Information:${NC}"
echo "   Model: $(getprop ro.product.model)"
echo "   Platform: $(getprop ro.board.platform)"
echo "   Hardware: $(getprop ro.hardware)"

# 2. Detect chipset type
echo -e "\n${BLUE}2. Chipset Detection:${NC}"
chipset=$(getprop ro.board.platform)
hardware=$(getprop ro.hardware)

if [[ "$chipset" == *"sm8"* ]] || [[ "$chipset" == *"msm"* ]] || [[ "$hardware" == *"qcom"* ]]; then
    echo -e "   ${GREEN}✓ Snapdragon detected (Adreno GPU)${NC}"
    GPU_TYPE="adreno"
elif [[ "$chipset" == *"exynos"* ]] || [[ "$hardware" == *"s5e"* ]] || [[ "$chipset" == *"s5e"* ]]; then
    echo -e "   ${GREEN}✓ Exynos detected (Xclipse/Mali GPU)${NC}"
    GPU_TYPE="exynos"
elif [[ "$chipset" == *"mt"* ]] || [[ "$hardware" == *"mediatek"* ]]; then
    echo -e "   ${YELLOW}⚠ MediaTek detected (Limited GPU support)${NC}"
    GPU_TYPE="mediatek"
else
    echo -e "   ${RED}✗ Unknown chipset${NC}"
    GPU_TYPE="unknown"
fi

# 3. Check GPU configuration file
echo -e "\n${BLUE}3. GPU Configuration:${NC}"
if [ -f "$HOME/.ollama/environment" ]; then
    echo -e "   ${GREEN}✓ GPU config file exists${NC}"
    echo "   Settings:"
    while IFS= read -r line; do
        if [[ ! "$line" =~ ^# ]] && [[ -n "$line" ]]; then
            echo "     $line"
        fi
    done < "$HOME/.ollama/environment"
else
    echo -e "   ${RED}✗ GPU config not found${NC}"
    echo "   Run: bash scripts/termux-gpu-setup.sh"
fi

# 4. Check required libraries
echo -e "\n${BLUE}4. GPU Libraries:${NC}"
if [ "$GPU_TYPE" == "adreno" ]; then
    if pkg list-installed 2>/dev/null | grep -q opencl; then
        echo -e "   ${GREEN}✓ OpenCL libraries installed${NC}"
    else
        echo -e "   ${YELLOW}⚠ OpenCL libraries missing${NC}"
        echo "   Run: pkg install opencl-headers opencl-clhpp"
    fi
elif [ "$GPU_TYPE" == "exynos" ]; then
    if pkg list-installed 2>/dev/null | grep -q vulkan; then
        echo -e "   ${GREEN}✓ Vulkan libraries installed${NC}"
    else
        echo -e "   ${YELLOW}⚠ Vulkan libraries missing${NC}"
        echo "   Run: pkg install vulkan-headers vulkan-loader-android"
    fi
fi

# 5. Check llama.cpp compilation
echo -e "\n${BLUE}5. llama.cpp GPU Support:${NC}"
if [ -f "$HOME/llama.cpp/main" ]; then
    echo -e "   ${GREEN}✓ llama.cpp compiled${NC}"
    
    # Check which GPU backend was compiled
    if [ -f "$HOME/llama.cpp/build.log" ]; then
        if grep -q "LLAMA_VULKAN=1" "$HOME/llama.cpp/build.log" 2>/dev/null; then
            echo "   Compiled with: Vulkan support"
        elif grep -q "LLAMA_CLBLAST=1" "$HOME/llama.cpp/build.log" 2>/dev/null; then
            echo "   Compiled with: OpenCL support"
        else
            echo "   Compiled with: CPU-only"
        fi
    fi
else
    echo -e "   ${RED}✗ llama.cpp not compiled${NC}"
    echo "   Run: bash scripts/termux-gpu-setup.sh"
fi

# 6. Check Ollama
echo -e "\n${BLUE}6. Ollama Status:${NC}"
if pgrep -f "ollama serve" > /dev/null; then
    echo -e "   ${GREEN}✓ Ollama is running${NC}"
    
    # Check if GPU acceleration is active
    if [ -f "$HOME/PocketLLM/logs/ollama.log" ]; then
        if tail -100 "$HOME/PocketLLM/logs/ollama.log" 2>/dev/null | grep -q "gpu_layers\|VRAM\|GPU acceleration"; then
            echo -e "   ${GREEN}✓ GPU acceleration appears active${NC}"
        else
            echo -e "   ${YELLOW}⚠ GPU acceleration status unclear${NC}"
        fi
    fi
else
    echo -e "   ${YELLOW}⚠ Ollama not running${NC}"
fi

# 7. Performance test (optional)
echo -e "\n${BLUE}7. Quick Performance Test:${NC}"
if pgrep -f "ollama serve" > /dev/null; then
    if ollama list 2>/dev/null | grep -q "llama3.2:1b\|phi3:mini\|gemma"; then
        echo "   Testing model response time..."
        start_time=$(date +%s%N)
        response=$(timeout 10 ollama run llama3.2:1b "Say 'test'" 2>/dev/null || echo "timeout")
        end_time=$(date +%s%N)
        
        if [[ "$response" != "timeout" ]]; then
            elapsed=$(( (end_time - start_time) / 1000000 ))
            echo -e "   Response time: ${elapsed}ms"
            
            if [ $elapsed -lt 2000 ]; then
                echo -e "   ${GREEN}✓ Excellent performance (likely GPU accelerated)${NC}"
            elif [ $elapsed -lt 5000 ]; then
                echo -e "   ${YELLOW}⚠ Moderate performance${NC}"
            else
                echo -e "   ${RED}✗ Slow performance (likely CPU-only)${NC}"
            fi
        else
            echo -e "   ${YELLOW}⚠ Test timed out${NC}"
        fi
    else
        echo "   No small model available for testing"
        echo "   Run: ollama pull llama3.2:1b"
    fi
else
    echo "   Skipped (Ollama not running)"
fi

# Summary
echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Summary:${NC}"

ALL_GOOD=true

if [ ! -f "$HOME/.ollama/environment" ]; then
    echo -e "${RED}• Run GPU setup: bash scripts/termux-gpu-setup.sh${NC}"
    ALL_GOOD=false
fi

if [ "$GPU_TYPE" == "unknown" ]; then
    echo -e "${YELLOW}• Unknown device - GPU acceleration may not work${NC}"
    ALL_GOOD=false
fi

if [ "$ALL_GOOD" == "true" ]; then
    echo -e "${GREEN}✓ GPU acceleration is properly configured!${NC}"
    echo -e "${GREEN}✓ Start PocketLLM with: bash termux-start.sh${NC}"
else
    echo -e "${YELLOW}⚠ Some configuration needed (see above)${NC}"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"