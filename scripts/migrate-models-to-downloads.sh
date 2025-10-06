#!/bin/bash

echo "======================================"
echo "PocketLLM Model Migration Script"
echo "======================================"
echo ""
echo "This script will move all GGUF models from"
echo "~/PocketLLM/models/ to your Downloads folder"
echo ""

# Check if Termux storage is setup
if [ ! -d "$HOME/storage" ]; then
    echo "⚠️  Termux storage not configured!"
    echo "Please run: termux-setup-storage"
    echo "Then restart this script"
    exit 1
fi

# Define source and destination
SOURCE_DIR="$HOME/PocketLLM/models"
DEST_DIR="$HOME/storage/downloads"

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "✓ No existing models directory found at $SOURCE_DIR"
    echo "Nothing to migrate."
    exit 0
fi

# Check if destination is accessible
if [ ! -d "$DEST_DIR" ]; then
    echo "❌ Cannot access Downloads folder at $DEST_DIR"
    echo "Please ensure termux-setup-storage has been run"
    exit 1
fi

# Count GGUF files
GGUF_COUNT=$(find "$SOURCE_DIR" -name "*.gguf" 2>/dev/null | wc -l)

if [ "$GGUF_COUNT" -eq 0 ]; then
    echo "✓ No GGUF models found in $SOURCE_DIR"
    echo "Nothing to migrate."
else
    echo "Found $GGUF_COUNT GGUF model(s) to migrate"
    echo ""
    
    # List models to be moved
    echo "Models to migrate:"
    find "$SOURCE_DIR" -name "*.gguf" -exec basename {} \;
    echo ""
    
    read -p "Continue with migration? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Move each GGUF file
        find "$SOURCE_DIR" -name "*.gguf" | while read -r file; do
            filename=$(basename "$file")
            echo "Moving $filename..."
            
            # Check if file already exists in destination
            if [ -f "$DEST_DIR/$filename" ]; then
                echo "  ⚠️  $filename already exists in Downloads"
                read -p "  Overwrite? (y/n): " -n 1 -r
                echo ""
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    echo "  Skipped $filename"
                    continue
                fi
            fi
            
            # Move the file
            mv "$file" "$DEST_DIR/"
            if [ $? -eq 0 ]; then
                echo "  ✓ Moved $filename"
            else
                echo "  ❌ Failed to move $filename"
            fi
        done
        
        echo ""
        echo "✅ Migration complete!"
        
        # Clean up empty directory
        if [ -z "$(ls -A $SOURCE_DIR)" ]; then
            echo "Removing empty models directory..."
            rmdir "$SOURCE_DIR"
        fi
    else
        echo "Migration cancelled."
    fi
fi

echo ""
echo "======================================"
echo "Next steps:"
echo "1. Download new GGUF models directly to Downloads via browser"
echo "2. Restart PocketLLM to scan for models"
echo "======================================"