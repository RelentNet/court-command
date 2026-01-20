# Technical Specification: RelentNet Pickleball System

## 1. Project Overview

A multi-tenant, high-performance sports ticker and referee system designed for pickleball tournaments. The system allows organizations to manage multiple courts, customize branding, and provide real-time score updates to spectators via a web-based ticker.

- **Primary Goal**: Zero-latency score synchronization between a mobile referee interface and a broadcast-quality court ticker.
- **Deployment Model**: "Appliance" style per-client deployment via Coolify.

---

## 2. Technical Stack

| Layer              | Technology                    | Purpose                                                   |
| ------------------ | ----------------------------- | --------------------------------------------------------- |
| **Frontend**       | Vite, TypeScript, TailwindCSS | High-speed, type-safe UI development.                     |
| **Routing**        | TanStack Router               | Type-safe nested routing for `/court/$id` and `/referee`. |
| **Backend**        | Python (FastAPI)              | Asynchronous API handling and WebSocket management.       |
| **Real-time**      | Redis Pub/Sub                 | Instant message broadcasting from Referee to Tickers.     |
| **Database**       | PostgreSQL                    | Event-sourced match logs and organizational settings.     |
| **Infrastructure** | Coolify, Docker               | Containerized deployment and environment management.      |

---

## 3. System Architecture

### 3.1 Data Flow (The "Sync")

1. **Referee Action**: User taps "Point" on a mobile device.
2. **API Command**: FastAPI receives an event (e.g., `ADD_POINT`).
3. **Persistence**: Event is appended to the `match_events` table in Postgres.
4. **Broadcast**: FastAPI publishes the updated match state to Redis.
5. **Update**: All connected Tickers receive the state via WebSockets and update the UI.

### 3.2 Routing Structure

Using TanStack Router to manage the distinct views:

- `/` : Organization Dashboard (Create/Manage Courts, Edit Branding).
- `/court/$courtId` : The Ticker (Broadcast view).
- `/court/$courtId/referee` : The Referee panel (Admin controls).
- `/court/$courtId/observer` : Read-only match log and server status.

---

## 4. Feature Requirements

### 4.1 Core Scoring Logic

- **Pickleball Logic Engine**: Automated handling of server numbers (1 and 2), side-outs, and "Win by 2" conditions.
- **Undo/Redo**: Ability to traverse the event log to correct referee mistakes.
- **Time Travel**: A "Playback" mode for spectators to see the match progress at specific timestamps.

### 4.2 Branding & Customization

- **Theme Engine**: Dynamic CSS variable injection for primary/secondary colors and background accents.
- **Asset Management**: Support for organization logos and sponsor banners.
- **Layout Toggles**: Options for "Livestream Overlay" (transparent background) vs. "Big Screen" (high contrast).

### 4.3 Management Tools

- **Court Orchestration**: Add/Remove courts dynamically without redeploying.
- **Global Monitoring**: A "Master View" for tournament directors to see scores across all courts simultaneously.

---

## 5. Database Schema (Conceptual)

### `Organizations` (Settings)

- `id`: UUID
- `name`: String
- `branding`: JSON (colors, logos, font preferences)

### `Courts`

- `id`: UUID
- `org_id`: ForeignKey
- `name`: String (e.g., "Championship Court")
- `status`: Enum (Idle, Active, Maintenance)

### `Match_Events` (Event Log)

- `id`: BigInt
- `match_id`: UUID
- `timestamp`: DateTime
- `event_type`: String (`POINT_A`, `POINT_B`, `SIDE_OUT`, `TIMEOUT`, `UNDO`)
- `metadata`: JSON (state of the score at that exact moment for fast reconstruction)

---

## 6. Implementation Roadmap

1. **Phase 1: The Engine**: Build the Python logic for the Pickleball scoring rules and the Postgres event log.
2. **Phase 2: Real-time Sync**: Integrate Redis and WebSockets for the "Ref-to-Ticker" pipeline.
3. **Phase 3: The UI**: Implement TanStack Router and the branding engine in Vite/TS.
4. **Phase 4: Coolify Master Template**: Wrap the entire stack into a Docker Compose template for one-click client onboarding.
