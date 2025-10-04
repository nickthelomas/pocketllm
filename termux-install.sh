#!/data/data/com.termux/files/usr/bin/bash

# PocketLLM Termux Auto-Install Script
# One-command setup for Termux + Termux:Boot + Termux:Widget

set -e

echo "🚀 PocketLLM Termux Installation Starting..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log function
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    error "This script must be run in Termux!"
    exit 1
fi

log "Step 1/10: Updating package repositories..."
pkg update -y

log "Step 2/10: Installing system dependencies..."
pkg install -y \
    nodejs \
    git \
    curl \
    wget \
    termux-api \
    termux-tools \
    termux-services

log "Step 3/10: Installing Ollama..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
    log "Ollama installed successfully"
else
    log "Ollama already installed"
fi

log "Step 4/10: Cloning/updating PocketLLM repository..."
INSTALL_DIR="$HOME/pocketllm"
if [ -d "$INSTALL_DIR" ]; then
    warn "PocketLLM directory exists, pulling latest changes..."
    cd "$INSTALL_DIR"
    git pull || true
else
    # For testing, we'll use the current directory
    # In production, this would be: git clone <repo-url> "$INSTALL_DIR"
    log "Using current directory as install location"
    INSTALL_DIR="$(pwd)"
fi

cd "$INSTALL_DIR"

log "Step 5/10: Installing Node.js dependencies..."
npm install

log "Step 6/10: Building frontend..."
npm run build

log "Step 7/10: Creating data directory..."
mkdir -p "$INSTALL_DIR/data"
log "Using MemStorage (in-memory) - defaults are pre-configured"

log "Step 8/10: Pulling default Ollama model (llama3.2:3b-instruct)..."
# Start Ollama in background
termux-wake-lock
ollama serve > "$INSTALL_DIR/data/ollama.log" 2>&1 &
OLLAMA_PID=$!
sleep 5

# Pull small model
if ollama pull llama3.2:3b-instruct; then
    log "Default model pulled successfully"
else
    warn "Failed to pull model (will retry on first startup)"
fi

# Stop Ollama for now
kill $OLLAMA_PID || true

log "Step 9/10: Setting up Termux:Boot auto-startup..."
mkdir -p ~/.termux/boot
chmod 700 ~/.termux/boot

cat > ~/.termux/boot/pocketllm-autostart << 'BOOTSCRIPT'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd $HOME/pocketllm
bash termux-start.sh > $HOME/pocketllm/data/boot.log 2>&1 &
BOOTSCRIPT

chmod +x ~/.termux/boot/pocketllm-autostart
log "Boot script created at ~/.termux/boot/pocketllm-autostart"

log "Step 10/10: Setting up Termux:Widget home screen launchers..."
mkdir -p ~/.shortcuts
chmod 700 ~/.shortcuts

# Launcher 1: Start Servers
cat > ~/.shortcuts/"PocketLLM — Start Servers.sh" << 'STARTSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
cd $HOME/pocketllm
termux-wake-lock
bash termux-start.sh
STARTSCRIPT

# Launcher 2: Open App
cat > ~/.shortcuts/"PocketLLM — Open App.sh" << 'OPENSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
termux-open-url http://localhost:5000
termux-toast "Opening PocketLLM..."
OPENSCRIPT

chmod +x ~/.shortcuts/*.sh
log "Widget scripts created in ~/.shortcuts/"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║  ✅ PocketLLM Installation Complete!                      ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Next Steps:"
echo ""
echo "  1. Open Termux:Boot app once to grant permissions"
echo "  2. Add Termux:Widget shortcuts to your home screen:"
echo "     • Long-press home screen → Widgets → Termux:Widget"
echo "     • Add 'PocketLLM — Start Servers'"
echo "     • Add 'PocketLLM — Open App'"
echo ""
echo "  3. Start the servers now:"
echo "     bash termux-start.sh"
echo ""
echo "  4. Open http://localhost:5000 in your browser"
echo ""
echo "💡 Servers will auto-start on device boot!"
echo ""
