#!/bin/bash

# Kill all GPU bridge related processes
echo "Killing all GPU bridge processes..."

# Kill Python GPU bridge (both versions)
pkill -f "ollama-gpu-bridge.py" 2>/dev/null && echo "  - Stopped GPU bridge"
pkill -f "ollama-gpu-bridge-v2.py" 2>/dev/null && echo "  - Stopped GPU bridge v2"

# Kill any llama.cpp processes
pkill -f "main.*gguf" 2>/dev/null && echo "  - Stopped llama.cpp main"
pkill -f "llama-cli.*gguf" 2>/dev/null && echo "  - Stopped llama-cli"

# Kill any hanging curl or test processes
pkill -f "curl.*11434" 2>/dev/null

# Remove PID files
rm -f ~/PocketLLM/pids/gpu-bridge.pid 2>/dev/null

# Wait for processes to fully stop
sleep 2

# Check if any are still running
if pgrep -f "ollama-gpu-bridge.py" > /dev/null; then
    echo "Warning: GPU bridge still running, force killing..."
    pkill -9 -f "ollama-gpu-bridge.py"
fi

if pgrep -f "main.*gguf" > /dev/null; then
    echo "Warning: llama.cpp still running, force killing..."
    pkill -9 -f "main.*gguf"
fi

echo "All GPU bridge processes stopped"