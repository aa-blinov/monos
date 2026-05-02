.PHONY: help install dev build docker-up docker-down clean

help:
	@echo "Zed Notes WebUI - Available Commands"
	@echo "===================================="
	@echo ""
	@echo "Development:"
	@echo "  make dev              - Start both backend and frontend in dev mode"
	@echo "  make backend-dev      - Start only backend"
	@echo "  make frontend-dev     - Start only frontend"
	@echo ""
	@echo "Installation:"
	@echo "  make install          - Install dependencies for backend and frontend"
	@echo "  make install-backend  - Install Python dependencies"
	@echo "  make install-frontend - Install Node dependencies"
	@echo ""
	@echo "Build:"
	@echo "  make build            - Build frontend for production"
	@echo "  make build-frontend   - Build frontend only"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up        - Start with Docker Compose"
	@echo "  make docker-down      - Stop Docker services"
	@echo "  make docker-build     - Build Docker images"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            - Remove node_modules and dist"
	@echo "  make clean-all        - Remove all build artifacts"

install: install-backend install-frontend
	@echo "✓ Dependencies installed"

install-backend:
	cd backend && pip install -r requirements.txt
	@echo "✓ Backend dependencies installed"

install-frontend:
	cd frontend && npm install
	@echo "✓ Frontend dependencies installed"

dev:
	@echo "Starting Zed Notes WebUI..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@echo "API Docs: http://localhost:8000/docs"
	@echo ""
	@echo "Press Ctrl+C to stop"
	@echo ""
	@(cd backend && python -m uvicorn main:app --reload --port 8000 &) & \
	(cd frontend && npm run dev)

backend-dev:
	cd backend && python -m uvicorn main:app --reload --port 8000

frontend-dev:
	cd frontend && npm run dev

build: build-frontend
	@echo "✓ Build complete"

build-frontend:
	cd frontend && npm run build
	@echo "✓ Frontend built"

docker-build:
	docker-compose build
	@echo "✓ Docker images built"

docker-up:
	docker-compose up -d
	@echo "✓ Services started"
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"

docker-down:
	docker-compose down
	@echo "✓ Services stopped"

clean:
	rm -rf frontend/node_modules frontend/dist
	rm -rf backend/__pycache__ backend/.pytest_cache
	@echo "✓ Cleaned"

clean-all: clean
	rm -rf .venv venv
	@echo "✓ Full cleanup complete"

# Aliases
dev-all: dev
start: docker-up
stop: docker-down
format-frontend:
	cd frontend && npm run format

format-backend:
	cd backend && python -m black .

lint-frontend:
	cd frontend && npm run lint

lint-backend:
	cd backend && python -m flake8 .
