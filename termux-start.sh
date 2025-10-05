#!/data/data/com.termux/files/usr/bin/bash

# PocketLLM Server Startup Script with Health Checks and Auto-Retry

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/data"
mkdir -p "$LOG_DIR"

OLLAMA_LOG="$LOG_DIR/ollama.log"
BACKEND_LOG="$LOG_DIR/backend.log"
HEALTH_LOG="$LOG_DIR/health.log"
PID_FILE="$LOG_DIR/pocketllm.pid"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$HEALTH_LOG"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$HEALTH_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$HEALTH_LOG"
}

# Health check function
check_health() {
    local service=$1
    local url=$2
    local max_retries=30
    local retry=0

    while [ $retry -lt $max_retries ]; do
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
        if [ "$http_code" = "200" ]; then
            log "$service is healthy (HTTP $http_code)"
            return 0
        fi
        retry=$((retry + 1))
        if [ $((retry % 5)) -eq 0 ]; then
            log "$service check $retry/$max_retries (HTTP ${http_code:-no response})"
        fi
        sleep 2
    done
    
    error "$service failed health check after $max_retries attempts"
    return 1
}

# Cleanup function
cleanup() {
    log "Stopping PocketLLM services..."
    if [ -f "$PID_FILE" ]; then
        while IFS= read -r pid; do
            kill "$pid" 2>/dev/null || true
        done < "$PID_FILE"
        rm "$PID_FILE"
    fi
    log "Services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

log "🚀 Starting PocketLLM services..."
log "Working directory: $SCRIPT_DIR"

# Keep device awake
termux-wake-lock

# Clear old PID file
rm -f "$PID_FILE"

# Check if already running
if pgrep -f "ollama serve" > /dev/null; then
    warn "Ollama already running, skipping..."
else
    log "Starting Ollama server..."
    cd "$SCRIPT_DIR"
    
    # Check for GPU configuration and use it if available
    if [ -f "$HOME/.ollama/environment" ]; then
        log "Found GPU configuration, loading..."
        source "$HOME/.ollama/environment"
        export $(grep -v '^#' $HOME/.ollama/environment | xargs)
        echo "GPU acceleration enabled with following settings:" >> "$OLLAMA_LOG"
        grep -v '^#' $HOME/.ollama/environment >> "$OLLAMA_LOG"
    else
        log "No GPU configuration found, using CPU mode"
    fi
    
    ollama serve > "$OLLAMA_LOG" 2>&1 &
    OLLAMA_PID=$!
    echo "$OLLAMA_PID" >> "$PID_FILE"
    log "Ollama PID: $OLLAMA_PID"
    
    # Wait for Ollama to be ready
    sleep 5
    if check_health "Ollama" "http://127.0.0.1:11434/api/tags"; then
        log "✅ Ollama server started successfully"
    else
        error "❌ Ollama failed to start, check $OLLAMA_LOG"
        exit 1
    fi
fi

# Ensure default model is available
log "Checking for default model..."
if ! ollama list | grep -q "llama3.2:1b"; then
    warn "Default model not found, pulling llama3.2:1b..."
    ollama pull llama3.2:1b || warn "Model pull failed, continuing..."
fi

# Check if backend already running
if pgrep -f "server/index.ts" > /dev/null || pgrep -f "node.*dist/index" > /dev/null; then
    warn "Backend already running, skipping..."
else
    log "Starting Express backend..."
    cd "$SCRIPT_DIR"
    export NODE_ENV=development
    export USE_MEMSTORAGE=true
    
    log "Using MemStorage (offline-ready, defaults pre-configured)"
    
    npx tsx server/index.ts > "$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!
    echo "$BACKEND_PID" >> "$PID_FILE"
    log "Backend PID: $BACKEND_PID"
    
    # Wait for backend to be ready
    sleep 8
    if check_health "Backend" "http://127.0.0.1:5000/api/health"; then
        log "✅ Backend server started successfully"
    else
        error "❌ Backend failed to start, check $BACKEND_LOG"
        cat "$BACKEND_LOG" | tail -20
        exit 1
    fi
fi

log "╔═══════════════════════════════════════════════════════════╗"
log "║                                                           ║"
log "║  ✅ PocketLLM is running!                                 ║"
log "║                                                           ║"
log "║  🌐 Frontend:  http://localhost:5000                      ║"
log "║  🤖 Ollama:    http://127.0.0.1:11434                     ║"
log "║                                                           ║"
log "╚═══════════════════════════════════════════════════════════╝"

# Send notification
termux-notification \
    --title "PocketLLM Started" \
    --content "Servers are running on localhost:5000" \
    --button1 "Open App" \
    --button1-action "termux-open-url http://localhost:5000" \
    2>/dev/null || true

log "Logs available at:"
log "  Ollama:  $OLLAMA_LOG"
log "  Backend: $BACKEND_LOG"
log "  Health:  $HEALTH_LOG"
log ""
log "Press Ctrl+C to stop servers"

# Keep script running
wait
