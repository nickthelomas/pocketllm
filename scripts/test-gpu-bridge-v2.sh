#!/bin/bash

echo "Testing GPU Bridge V2"
echo "===================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Health check
echo -e "\n${YELLOW}1. Health Check:${NC}"
response=$(curl -s http://localhost:11434/health)
if echo "$response" | grep -q "ok"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "$response" | python3 -m json.tool | head -5
else
    echo -e "${RED}✗ Health check failed${NC}"
fi

# Test 2: List models
echo -e "\n${YELLOW}2. List Models:${NC}"
models=$(curl -s http://localhost:11434/api/tags | python3 -m json.tool | grep '"name"' | head -3)
if [ ! -z "$models" ]; then
    echo -e "${GREEN}✓ Models found:${NC}"
    echo "$models"
else
    echo -e "${RED}✗ No models found${NC}"
fi

# Test 3: Generate endpoint
echo -e "\n${YELLOW}3. Testing Generate Endpoint:${NC}"
response=$(curl -s -X POST http://localhost:11434/api/generate \
    -H "Content-Type: application/json" \
    -d '{
        "model": "tinyllama",
        "prompt": "Say hello",
        "stream": false,
        "options": {
            "num_predict": 20
        }
    }' 2>/dev/null)

if echo "$response" | grep -q "response"; then
    echo -e "${GREEN}✓ Generate endpoint working${NC}"
    echo "$response" | python3 -c "import sys, json; print('Response:', json.load(sys.stdin).get('response', 'No response')[:100])"
else
    echo -e "${RED}✗ Generate endpoint failed${NC}"
    echo "$response"
fi

# Test 4: Chat endpoint
echo -e "\n${YELLOW}4. Testing Chat Endpoint:${NC}"
response=$(curl -s -X POST http://localhost:11434/api/chat \
    -H "Content-Type: application/json" \
    -d '{
        "model": "tinyllama",
        "messages": [
            {"role": "user", "content": "Say hello in 3 words"}
        ],
        "stream": false,
        "options": {
            "num_predict": 20
        }
    }' 2>/dev/null)

if echo "$response" | grep -q "message"; then
    echo -e "${GREEN}✓ Chat endpoint working${NC}"
    echo "$response" | python3 -c "import sys, json; msg = json.load(sys.stdin).get('message', {}); print('Response:', msg.get('content', 'No content')[:100])"
else
    echo -e "${RED}✗ Chat endpoint failed${NC}"
    echo "$response"
fi

echo -e "\n${YELLOW}Test complete!${NC}"