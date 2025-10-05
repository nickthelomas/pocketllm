#!/data/data/com.termux/files/usr/bin/bash
# Export Ollama models to GGUF format for GPU bridge
# Ollama stores models in blob format - this script converts them

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

OLLAMA_DIR="$HOME/.ollama/models"
TARGET_DIR="$HOME/PocketLLM/models"

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Export Ollama Models to GGUF Format         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Ollama models directory exists
if [ ! -d "$OLLAMA_DIR/manifests" ]; then
    echo -e "${RED}✗ Ollama models directory not found${NC}"
    echo "No Ollama models to export."
    exit 1
fi

# Create target directory
mkdir -p "$TARGET_DIR"

# Counter for exported models
exported=0
skipped=0

echo -e "${BLUE}Scanning Ollama models...${NC}\n"

# Function to extract model name from manifest path
get_model_name() {
    local manifest_path="$1"
    # Extract from path like: registry.ollama.ai/library/tinyllama/latest
    local name=$(echo "$manifest_path" | sed 's|.*/\([^/]*\)/[^/]*$|\1|')
    echo "$name"
}

# Function to find the GGUF blob from manifest
find_gguf_blob() {
    local manifest_file="$1"
    
    # Parse manifest JSON to find layers
    # Ollama manifests reference blob files by digest
    if [ -f "$manifest_file" ]; then
        # Try to find application/vnd.ollama.image.model layer (the actual GGUF)
        local blob_digest=$(python3 -c "
import json
import sys
try:
    with open('$manifest_file') as f:
        data = json.load(f)
        # Look for model layer in layers
        for layer in data.get('layers', []):
            media_type = layer.get('mediaType', '')
            if 'model' in media_type.lower():
                print(layer.get('digest', '').replace('sha256:', 'sha256-'))
                break
except:
    pass
" 2>/dev/null)
        
        if [ -n "$blob_digest" ]; then
            echo "$blob_digest"
            return 0
        fi
    fi
    return 1
}

# Scan all manifests
find "$OLLAMA_DIR/manifests" -type f | while read -r manifest; do
    model_name=$(get_model_name "$manifest")
    
    # Skip if model name is empty or looks like a path component
    if [ -z "$model_name" ] || [ "$model_name" = "library" ] || [ "$model_name" = "ollama.ai" ]; then
        continue
    fi
    
    echo -e "${YELLOW}Found: ${NC}$model_name"
    
    # Find the GGUF blob
    blob_digest=$(find_gguf_blob "$manifest")
    
    if [ -n "$blob_digest" ]; then
        blob_file="$OLLAMA_DIR/blobs/$blob_digest"
        
        if [ -f "$blob_file" ]; then
            # Get file size for display
            size=$(du -h "$blob_file" | cut -f1)
            
            # Check if already exported
            target_file="$TARGET_DIR/${model_name}.gguf"
            if [ -f "$target_file" ]; then
                echo -e "  ${BLUE}→${NC} Already exported (${size})"
                ((skipped++))
            else
                # Copy blob as GGUF file
                echo -e "  ${BLUE}→${NC} Exporting ${size} to ${model_name}.gguf..."
                cp "$blob_file" "$target_file"
                
                if [ $? -eq 0 ]; then
                    echo -e "  ${GREEN}✓${NC} Exported successfully"
                    ((exported++))
                else
                    echo -e "  ${RED}✗${NC} Export failed"
                fi
            fi
        else
            echo -e "  ${RED}✗${NC} Blob file not found: $blob_digest"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Could not find model blob in manifest"
    fi
    echo ""
done

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Export complete!${NC}"
echo -e "  Exported: ${GREEN}$exported${NC}"
echo -e "  Skipped:  ${BLUE}$skipped${NC}"
echo ""
echo -e "Models location: ${YELLOW}$TARGET_DIR${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Restart GPU bridge: ${YELLOW}bash termux-start-gpu.sh${NC}"
echo -e "  2. Click 'Sync Models' in web GUI"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
