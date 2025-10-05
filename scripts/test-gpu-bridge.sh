#!/bin/bash

echo "Testing GPU Bridge Model Mapping Fix"
echo "===================================="

# Test 1: List models
echo -e "\n1. Testing /api/tags endpoint:"
curl -s http://localhost:11434/api/tags | python3 -m json.tool | grep -E '"name"|"model"' | head -10

# Test 2: Try different model name variations
echo -e "\n2. Testing model name resolution:"

test_model() {
    local model_name="$1"
    echo -n "  Testing '$model_name': "
    response=$(curl -s -X POST http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"$model_name\", \"prompt\": \"Hi\", \"stream\": false}" 2>/dev/null)
    
    if echo "$response" | grep -q "error"; then
        echo "FAILED - $(echo "$response" | grep -o '"error":"[^"]*"')"
    elif echo "$response" | grep -q "response"; then
        echo "SUCCESS"
    else
        echo "UNKNOWN - $response"
    fi
}

# Test various model name formats
test_model "tinyllama"
test_model "tinyllama:latest"
test_model "tinyllama:1b"
test_model "tinyllama-1.1b-chat-q4_k_m.gguf"
test_model "llama3.2:1b"
test_model "llama3"

echo -e "\n3. Testing chat endpoint:"
curl -s -X POST http://localhost:11434/api/chat \
    -H "Content-Type: application/json" \
    -d '{
        "model": "tinyllama",
        "messages": [{"role": "user", "content": "Say hello in 3 words"}],
        "stream": false
    }' | python3 -c "import sys, json; data = json.load(sys.stdin); print('Response:', data.get('message', {}).get('content', 'No response')[:50])"

echo -e "\nTest complete!"