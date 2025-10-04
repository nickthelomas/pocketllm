# PocketLLM Termux Installation Guide

**One-command setup for Android deployment with auto-start, health monitoring, and home screen widgets**

---

## 📋 Prerequisites

### Required Apps (All from F-Droid)

1. **Termux** - Main terminal emulator
   - Download: https://f-droid.org/packages/com.termux/
   
2. **Termux:Boot** - Auto-start on device boot
   - Download: https://f-droid.org/packages/com.termux.boot/
   
3. **Termux:Widget** - Home screen shortcuts
   - Download: https://f-droid.org/packages/com.termux.widget/

⚠️ **Important**: 
- Uninstall all Google Play versions first
- All Termux apps MUST come from F-Droid
- Grant storage permissions when prompted

---

## 🚀 Quick Install

### Step 1: Initial Setup

Open Termux and run:

```bash
# Grant storage access
termux-setup-storage

# Clone the repository (or upload files)
cd ~
git clone <your-repo-url> pocketllm
cd pocketllm

# Run the installer
bash termux-install.sh
```

The installer will automatically:
- ✅ Install Node.js, Git, Ollama
- ✅ Build the frontend (with default settings pre-configured)
- ✅ Pull default model (llama3.2:3b-instruct)
- ✅ Create boot scripts for auto-start
- ✅ Create widget shortcuts for home screen

**Installation takes 10-20 minutes** depending on your internet speed.

---

## 📱 Post-Install Setup

### Step 2: Enable Auto-Boot

1. Open **Termux:Boot** app once (just tap the icon)
2. Grant "Draw over other apps" permission if prompted
3. Done! Servers will auto-start on device boot

### Step 3: Add Home Screen Widgets

1. Long-press empty space on your home screen
2. Tap **Widgets**
3. Find **Termux:Widget**
4. Drag widget to home screen
5. Select **"PocketLLM — Start Servers"**
6. Repeat to add **"PocketLLM — Open App"**

---

## 🎯 Usage

### Starting the Servers

**Option 1**: Tap the **"PocketLLM — Start Servers"** widget

**Option 2**: Manual start in Termux:
```bash
cd ~/pocketllm
bash termux-start.sh
```

The startup script will:
- Start Ollama LLM server (port 11434)
- Start Express backend (port 5000)
- Run health checks with auto-retry
- Send Android notification when ready
- Keep device awake while running

### Opening the App

**Option 1**: Tap the **"PocketLLM — Open App"** widget

**Option 2**: Open browser to:
```
http://localhost:5000
```

### Checking System Health

1. Open the app
2. Click the **Activity** icon (pulse icon) in the top toolbar
3. View real-time status of:
   - Backend Server
   - Database
   - Ollama LLM Server

---

## 🔧 Configuration

### Default Settings

The app uses MemStorage (in-memory) with pre-configured defaults (no manual configuration needed):

- **Ollama URL**: `http://127.0.0.1:11434` (Termux-compatible)
- **Temperature**: 0.7
- **Max Tokens**: 2048
- **Memory Budget**: 4000 tokens
- **RAG Chunk Size**: 512 words

All data is stored in memory during runtime. Export your conversations regularly using the Export button.

### Customizing Settings

1. Open the app
2. Click **Settings** (gear icon)
3. Adjust LLM parameters, memory settings, etc.
4. Settings are automatically saved to database

---

## 📁 File Structure

```
~/pocketllm/
├── termux-install.sh              # Main installer
├── termux-start.sh                # Server startup script
├── data/                          # Runtime data
│   ├── ollama.log                # Ollama server logs
│   ├── backend.log               # Express server logs
│   ├── health.log                # Health check logs
│   └── pocketllm.pid             # Process IDs
├── ~/.termux/boot/
│   └── pocketllm-autostart       # Boot script
└── ~/.shortcuts/
    ├── PocketLLM — Start Servers.sh
    └── PocketLLM — Open App.sh
```

---

## 🩺 Health Monitoring

### Frontend Health Viewer

- **Access**: Click Activity icon in app toolbar
- **Features**:
  - Real-time status for all services
  - Auto-refresh every 3 seconds (optional)
  - Troubleshooting tips for failures
  - Connection diagnostics

### Server Logs

View logs in Termux:

```bash
# Ollama logs
tail -f ~/pocketllm/data/ollama.log

# Backend logs
tail -f ~/pocketllm/data/backend.log

# Health check logs
tail -f ~/pocketllm/data/health.log

# Boot logs (after device restart)
cat ~/pocketllm/data/boot.log
```

---

## 🔄 Auto-Retry & Health Checks

The startup script includes:

- **30 retries** for each service (60 seconds timeout)
- **Automatic model pull** if default model missing
- **Process PID tracking** for clean shutdown
- **Termux wake-lock** to prevent sleep during operation
- **Android notifications** on successful start

---

## 🛠️ Troubleshooting

### Servers Won't Start

```bash
# Check if already running
pgrep -f ollama
pgrep -f "npm run dev"

# Kill existing processes
pkill ollama
pkill -f "npm run dev"

# Restart
bash ~/pocketllm/termux-start.sh
```

### Ollama Not Found

```bash
# Reinstall Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version
```

### Database Connection Failed

```bash
# Check if DATABASE_URL is set
echo $DATABASE_URL

# If not set, the app uses PostgreSQL by default
# For local testing, ensure PostgreSQL is running
```

### Widget Not Appearing

```bash
# Fix permissions
chmod 700 ~/.shortcuts
chmod +x ~/.shortcuts/*.sh

# Refresh widget list
# Remove and re-add widget to home screen
```

### Boot Script Not Running

```bash
# Check permissions
chmod 700 ~/.termux/boot
chmod +x ~/.termux/boot/pocketllm-autostart

# Verify Termux:Boot was opened once
# Reinstall Termux:Boot from F-Droid if needed
```

---

## 🔋 Battery Optimization

### Disable Battery Restrictions

1. Go to **Settings** → **Apps** → **Termux**
2. Tap **Battery**
3. Select **Unrestricted** or **Don't optimize**

This prevents Android from killing background processes.

### Wake Lock

The startup script automatically acquires a wake lock to keep the device awake during server operation.

---

## 🌐 Offline Operation

After initial install, PocketLLM works **100% offline**:

- ✅ No internet required for chat
- ✅ All models run locally via Ollama
- ✅ Database stored locally
- ✅ RAG documents processed locally
- ✅ Embeddings generated locally

Only requires internet for:
- Pulling new Ollama models
- Initial Ollama installation

---

## 🔄 Updating PocketLLM

```bash
cd ~/pocketllm
git pull
npm install
npm run build
```

Then restart servers using the widget or:
```bash
bash termux-start.sh
```

---

## ❌ Uninstalling

```bash
# Stop services
pkill ollama
pkill -f "npm run dev"

# Remove files
rm -rf ~/pocketllm
rm -rf ~/.termux/boot/pocketllm-autostart
rm -rf ~/.shortcuts/PocketLLM*

# Uninstall Ollama (optional)
# Manually remove from Termux packages
```

---

## 💡 Tips & Best Practices

### Model Management

- **Start small**: llama3.2:3b-instruct (2GB) is perfect for phones
- **Pull via UI**: Use the Pull button in the app for progress tracking
- **Sync regularly**: Click Sync to refresh available models

### Performance

- **Close other apps**: LLM inference is memory-intensive
- **Use smaller models**: 3B models work best on phones
- **Monitor temperature**: Long sessions may heat the device

### Data Management

- **Export regularly**: Use Export button to backup conversations
- **Clear old chats**: Delete unused conversations to save space
- **Monitor storage**: RAG documents consume device storage

---

## 📚 Additional Resources

- **Termux Wiki**: https://wiki.termux.com
- **Ollama Docs**: https://ollama.ai/docs
- **PocketLLM Repo**: [Link to your repository]

---

## 🐛 Reporting Issues

When reporting issues, include:

1. Output of `bash termux-start.sh`
2. Relevant logs from `~/pocketllm/data/`
3. Android version and device model
4. Screenshot of health viewer if applicable

---

**Happy local LLM chatting! 🎉**
