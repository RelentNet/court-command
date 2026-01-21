# RelentNet Pickleball System

**RelentNet** is a modern, real-time sports ticker and referee management system designed for pickleball tournaments. It features a high-performance backend, instantaneous score synchronization via WebSockets, and a robust registry for managing players, teams, and courts.

## 🚀 Features

*   **Real-time Scoring:** Instant updates across referee consoles and broadcast scoreboards.
*   **Court Management:** Monitor active matches and court status live from a central dashboard.
*   **Registry:** Manage players and teams with ease.
*   **Match History:** Automatically archive match results and statistics.
*   **Quick Match:** Start ad-hoc games instantly without complex setup.

## 📚 Documentation

Detailed documentation is available in the [`docs/`](./docs) directory:

*   [**Project Guide (GEMINI.md)**](./docs/GEMINI.md): Comprehensive guide for developers, including architecture, setup, and contribution norms.
*   [**API Documentation**](./docs/API_DOCUMENTATION.md): Reference for all Backend API endpoints and Data Models.
*   [**Architecture Analysis**](./docs/ARCHITECTURE_ANALYSIS.md): Deep dive into the data flow and system components.

## 🛠️ Quick Start

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

## 🏗️ Technology Stack

*   **Frontend:** React, Vite, TanStack Router, Tailwind CSS
*   **Backend:** FastAPI, Python, SQLModel (PostgreSQL)
*   **Real-time:** Redis Pub/Sub, WebSockets
