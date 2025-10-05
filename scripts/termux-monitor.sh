#!/data/data/com.termux/files/usr/bin/bash
# PocketLLM Performance Monitor
# Real-time GPU and CPU monitoring for Termux

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Function to get CPU usage
get_cpu_usage() {
    # Get CPU stats from /proc/stat
    local cpu_line=$(grep '^cpu ' /proc/stat)
    echo "$cpu_line"
}

# Function to calculate CPU percentage
calculate_cpu_percent() {
    local prev_total=$1
    local prev_idle=$2
    
    # Read current CPU stats
    local cpu_stats=($(get_cpu_usage))
    local user=${cpu_stats[1]}
    local nice=${cpu_stats[2]}
    local system=${cpu_stats[3]}
    local idle=${cpu_stats[4]}
    local iowait=${cpu_stats[5]}
    local irq=${cpu_stats[6]}
    local softirq=${cpu_stats[7]}
    
    # Calculate totals
    local total=$((user + nice + system + idle + iowait + irq + softirq))
    local active=$((total - idle))
    
    # Calculate differences
    local diff_total=$((total - prev_total))
    local diff_idle=$((idle - prev_idle))
    
    # Calculate CPU percentage
    if [ $diff_total -gt 0 ]; then
        local cpu_percent=$(( (diff_total - diff_idle) * 100 / diff_total ))
        echo "$cpu_percent $total $idle"
    else
        echo "0 $total $idle"
    fi
}

# Function to get memory info
get_memory_info() {
    local total=$(grep '^MemTotal:' /proc/meminfo | awk '{print $2}')
    local available=$(grep '^MemAvailable:' /proc/meminfo | awk '{print $2}')
    local used=$((total - available))
    local percent=$((used * 100 / total))
    
    # Convert to MB
    local total_mb=$((total / 1024))
    local used_mb=$((used / 1024))
    
    echo "$used_mb $total_mb $percent"
}

# Function to get GPU info (if available)
get_gpu_info() {
    # Check for Adreno GPU
    if [ -f /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage ]; then
        local gpu_busy=$(cat /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage 2>/dev/null || echo "0")
        local gpu_freq=$(cat /sys/class/kgsl/kgsl-3d0/gpuclk 2>/dev/null || echo "0")
        echo "Adreno $gpu_busy $((gpu_freq / 1000000))"
        return
    fi
    
    # Check for Mali GPU
    if [ -f /sys/devices/platform/mali.0/utilization ]; then
        local gpu_util=$(cat /sys/devices/platform/mali.0/utilization 2>/dev/null || echo "0")
        echo "Mali $gpu_util 0"
        return
    fi
    
    # Check for generic GPU usage via kernel
    if [ -d /sys/kernel/gpu ]; then
        local gpu_load=$(find /sys/kernel/gpu -name "load" -o -name "busy" 2>/dev/null | head -1)
        if [ -n "$gpu_load" ] && [ -f "$gpu_load" ]; then
            local gpu_percent=$(cat "$gpu_load" 2>/dev/null || echo "0")
            echo "GPU $gpu_percent 0"
            return
        fi
    fi
    
    echo "N/A 0 0"
}

# Function to check Ollama status
check_ollama_status() {
    if pgrep -f "ollama serve" > /dev/null; then
        # Try to get loaded model info
        local model_info=$(curl -s http://127.0.0.1:11434/api/tags 2>/dev/null | grep -oP '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$model_info" ]; then
            echo "Running ($model_info)"
        else
            echo "Running"
        fi
        
        # Check for GPU acceleration indicators in Ollama logs
        if [ -f "$HOME/PocketLLM/logs/ollama.log" ]; then
            if grep -q "GPU acceleration enabled\|VRAM\|gpu_layers" "$HOME/PocketLLM/logs/ollama.log" 2>/dev/null; then
                echo " [GPU]"
            fi
        fi
    else
        echo "Stopped"
    fi
}

# Function to get battery info
get_battery_info() {
    local battery_level=$(termux-battery-status 2>/dev/null | grep -oP '"percentage":\s*\K\d+' || echo "N/A")
    local charging_status=$(termux-battery-status 2>/dev/null | grep -oP '"status":\s*"\K[^"]+' || echo "Unknown")
    echo "$battery_level $charging_status"
}

# Function to display progress bar
draw_bar() {
    local percent=$1
    local width=20
    local filled=$((percent * width / 100))
    local empty=$((width - filled))
    
    printf "["
    if [ $percent -ge 80 ]; then
        printf "${RED}"
    elif [ $percent -ge 60 ]; then
        printf "${YELLOW}"
    else
        printf "${GREEN}"
    fi
    
    for ((i=0; i<filled; i++)); do printf "█"; done
    printf "${NC}"
    for ((i=0; i<empty; i++)); do printf "░"; done
    printf "] %3d%%" "$percent"
}

# Main monitoring loop
clear
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         PocketLLM Performance Monitor            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Press Ctrl+C to exit"
echo ""

# Initialize CPU tracking
prev_cpu=($(get_cpu_usage))
prev_total=${prev_cpu[1]}
prev_idle=${prev_cpu[4]}

# Main loop
while true; do
    # Move cursor to position
    tput cup 6 0
    
    # Get current time
    current_time=$(date '+%H:%M:%S')
    
    # Get CPU usage
    cpu_data=($(calculate_cpu_percent $prev_total $prev_idle))
    cpu_percent=${cpu_data[0]}
    prev_total=${cpu_data[1]}
    prev_idle=${cpu_data[2]}
    
    # Get memory info
    mem_data=($(get_memory_info))
    mem_used=${mem_data[0]}
    mem_total=${mem_data[1]}
    mem_percent=${mem_data[2]}
    
    # Get GPU info
    gpu_data=($(get_gpu_info))
    gpu_type=${gpu_data[0]}
    gpu_percent=${gpu_data[1]}
    gpu_freq=${gpu_data[2]}
    
    # Get Ollama status
    ollama_status=$(check_ollama_status)
    
    # Get battery info
    battery_data=($(get_battery_info))
    battery_level=${battery_data[0]}
    battery_status=${battery_data[1]}
    
    # Display system info
    echo -e "${BLUE}═══ System Status ═══${NC} [$current_time]"
    echo ""
    
    # CPU
    echo -ne "${MAGENTA}CPU Usage:${NC}    "
    draw_bar $cpu_percent
    echo " ($(nproc) cores)"
    
    # Memory
    echo -ne "${MAGENTA}Memory:${NC}       "
    draw_bar $mem_percent
    echo " (${mem_used}MB / ${mem_total}MB)"
    
    # GPU (if available)
    if [ "$gpu_type" != "N/A" ]; then
        echo -ne "${MAGENTA}GPU ($gpu_type):${NC} "
        draw_bar $gpu_percent
        if [ $gpu_freq -gt 0 ]; then
            echo " (${gpu_freq}MHz)"
        else
            echo ""
        fi
    else
        echo -e "${MAGENTA}GPU:${NC}          ${YELLOW}Not detected${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}═══ Service Status ═══${NC}"
    echo -e "${MAGENTA}Ollama:${NC}       $ollama_status"
    
    # Check if backend is running
    if pgrep -f "server/index.ts" > /dev/null || pgrep -f "node.*dist/index" > /dev/null; then
        echo -e "${MAGENTA}Backend:${NC}      ${GREEN}Running${NC}"
    else
        echo -e "${MAGENTA}Backend:${NC}      ${RED}Stopped${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}═══ Device Info ═══${NC}"
    echo -e "${MAGENTA}Model:${NC}        $(getprop ro.product.model)"
    echo -e "${MAGENTA}Platform:${NC}     $(getprop ro.board.platform)"
    if [ "$battery_level" != "N/A" ]; then
        echo -ne "${MAGENTA}Battery:${NC}      "
        if [ "$battery_status" == "CHARGING" ]; then
            echo -e "${GREEN}${battery_level}% ⚡${NC}"
        else
            if [ $battery_level -le 20 ]; then
                echo -e "${RED}${battery_level}%${NC}"
            elif [ $battery_level -le 50 ]; then
                echo -e "${YELLOW}${battery_level}%${NC}"
            else
                echo -e "${GREEN}${battery_level}%${NC}"
            fi
        fi
    fi
    
    # Clear remaining lines
    echo -e "\033[K"
    echo -e "\033[K"
    echo -e "\033[K"
    
    sleep 2
done