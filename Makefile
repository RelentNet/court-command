.PHONY: dev-backend dev-frontend dev install

# Detect python command
PYTHON := $(shell command -v python3 2> /dev/null || command -v python)

install:
	@echo "Installing Backend Dependencies..."
	cd backend && $(PYTHON) -m pip install -r requirements.txt
	@echo "Installing Frontend Dependencies..."
	cd frontend && npm install

dev-backend:
	@echo "Starting Backend..."
	cd backend && $(PYTHON) main.py

dev-frontend:
	@echo "Starting Frontend..."
	cd frontend && npm run dev

dev:
	@echo "Starting Development Environment (Backend + Frontend)..."
	@echo "Press Ctrl+C to stop."
	@make -j 2 dev-backend dev-frontend