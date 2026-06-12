#!/bin/bash

set -e

echo "🚀 Zed Notes WebUI — Local Development Setup"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -f "backend/main.py" ]; then
    echo "❌ Please run this script from webui/ directory"
    exit 1
fi

# Backend setup
echo -e "${BLUE}📦 Backend Setup${NC}"
cd backend
echo "Installing Python dependencies..."
pip3 install -q -r requirements.txt 2>/dev/null || pip3 install -r requirements.txt
cd ..

# Frontend setup
echo -e "${BLUE}🎨 Frontend Setup${NC}"
cd frontend
echo "Installing Node dependencies..."
npm install --legacy-peer-deps --silent 2>/dev/null || npm install --legacy-peer-deps
cd ..

echo ""
echo -e "${GREEN}✅ Dependencies installed!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo ""
echo "Open TWO terminals and run:"
echo ""
echo "Terminal 1:"
echo -e "  ${BLUE}cd zed-notes/webui/backend${NC}"
echo -e "  ${BLUE}python3 -m uvicorn main:app --reload --port 8000${NC}"
echo ""
echo "Terminal 2:"
echo -e "  ${BLUE}cd zed-notes/webui/frontend${NC}"
echo -e "  ${BLUE}npm run dev${NC}"
echo ""
echo "Then open: ${GREEN}http://localhost:5173${NC}"
echo ""
echo -e "${YELLOW}🔗 Links:${NC}"
echo "  Frontend:     http://localhost:5173"
echo "  Backend API:  http://localhost:8000"
echo "  API Docs:     http://localhost:8000/docs"
echo ""
