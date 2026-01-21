# RelentNet Pickleball System

## Project Overview

RelentNet is a multi-tenant, high-performance sports ticker and referee system designed for pickleball tournaments. It enables zero-latency score synchronization between a mobile referee interface and a broadcast-quality court ticker. The system is designed for "Appliance" style deployment via Coolify.

## Technology Stack

*   **Frontend:** React (TypeScript), Vite, Tailwind CSS, TanStack Router
*   **Backend:** Python (FastAPI), Uvicorn
*   **Database:** PostgreSQL (using SQLModel/AsyncPG)
*   **Real-time:** Redis Pub/Sub (for instant score updates)
*   **Infrastructure:** Docker, Coolify

## Architecture & Data Flow

*   **Data Flow:** Referee Action -> API (FastAPI) -> Persistence (Postgres) -> Broadcast (Redis) -> Ticker (WebSocket Update)
*   **Routing (Frontend):**
    *   `/`: Organization Dashboard / Match List
    *   `/courts`: Court Management Dashboard
    *   `/courts/$courtSlug`: Specific Court View (Active Match Landing)
    *   `/match/$matchId`: Match Ticker & Referee Interface
*   **API Structure:**
    *   Routes are **NOT** prefixed with `/api`.
    *   `/matches`: Game logic (Points, Sideouts, Undo).
    *   `/courts`: Court management (CRUD).
    *   `/players` & `/teams`: Registry management.

## Critical Operational Notes

### Database Management
*   **Environment:** Development often runs against a **Staging PostgreSQL Database** accessed via an **SSH Tunnel** (localhost:5432).
*   **Schema Migrations:**
    *   We do **NOT** use Alembic yet.
    *   `SQLModel.metadata.create_all` only creates *missing* tables. It does **NOT** update existing tables.
    *   **Fixing Schema Drift:** If you modify a model (e.g., adding columns), you must manually drop the affected tables (or `drop_all` temporarily) to force recreation. **DO NOT** assume `make dev` handles migrations automatically.

### State Management
*   **Match State:** Uses "Event Sourcing Lite". The `Match` table holds the current state, but `MatchEvent` holds a history of snapshots (`score_snapshot`).
*   **Undo Logic:** Relies on restoring the previous `score_snapshot` from `MatchEvent`. This is robust and handles complex state changes (like reverting a "Game Won" event) without custom reverse logic.

## Development Guide

### Backend (`/backend`)

The backend is a FastAPI application managing game logic, database interactions, and real-time updates.

**Setup & Run:**

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
# Accessible at http://localhost:8000
python main.py
```

**Key Files:**
*   `main.py`: Application entry point, API routes, and startup logic.
*   `models.py`: Database models (SQLModel).
*   `services/`: Business logic separated by domain (`match_service.py`, `court_service.py`, `registry_service.py`).
*   `database.py`: Database connection and initialization.

### Frontend (`/frontend`)

The frontend is a React application built with Vite, using TanStack Router for navigation and Tailwind CSS for styling.

**Setup & Run:**

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
# Accessible at http://localhost:3000
npm run dev
```

**Build & Test:**

```bash
# Build for production
npm run build

# Run tests (Vitest)
npm run test

# Lint and Format
npm run check
```

**Key Files:**
*   `src/routes/`: TanStack Router route definitions.
*   `vite.config.ts`: Vite configuration.
*   `package.json`: Dependencies and scripts.

## Contribution & Conventions

*   **Code Style:**
    *   **Frontend:** Prettier and ESLint are configured. Run `npm run check` before committing.
    *   **Backend:** Follow PEP 8 standards.
*   **Testing:** Frontend uses Vitest. Ensure tests pass before merging.
*   **State Management:** Score state is critical; ensure atomic updates and proper synchronization between backend and frontend.
