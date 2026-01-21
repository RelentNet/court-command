# CourtCommand Architecture & Data Flow Analysis

This document traces the data flow, component hierarchy, and key operations within the CourtCommand Pickleball Ticker application.

## 1. System Components

- **Frontend Client:** React/Vite SPA (Single Page Application)
- **API Server:** Python FastAPI
- **Database:** PostgreSQL (Persistent Storage)
- **Message Broker:** Redis (Real-time Pub/Sub)

## 2. Component Hierarchy (Frontend)

The frontend is structured around TanStack Router and React Query.

- `routes/__root.tsx` (Global Layout)
  - `routes/match.$matchId.tsx` (Match Container)
    - **Responsibility:**
      - Fetches initial `Match` state via REST.
      - Establishes WebSocket connection via `useMatchSocket`.
      - Handles mutations (Point, Side Out, Undo).
    - `components/Scoreboard.tsx`
      - **Responsibility:** Displays scores, server indicator, and primary action buttons.
    - `components/ControlPanel.tsx`
      - **Responsibility:** Secondary controls (Timeouts, Warnings - currently placeholders).
    - `components/DebugConsole.tsx`
      - **Responsibility:** Raw JSON view of match state for developers.

## 3. Data Flow Trace: "Point Scored"

The following sequence describes what happens when a referee logs a point.

### Step 1: User Action (Frontend)

1.  User clicks the **"+ Point"** button in `Scoreboard.tsx`.
2.  `match.$matchId.tsx` triggers a React Query mutation.
3.  Browser sends `POST /api/matches/{public_id}/point` to the backend.

### Step 2: API Processing (Backend)

4.  `main.py` receives the request and delegates to `MatchService.add_point()`.
5.  **Database Lock:** `MatchService` executes `SELECT ... FOR UPDATE` on the `match` table to prevent race conditions.
6.  **Business Logic:**
    - Increments the serving team's score.
    - Calculates the new state.
7.  **Audit Logging:** A new `MatchEvent` row is inserted, recording:
    - `event_type`: "POINT_SCORED"
    - `score_snapshot`: The complete match state _after_ the change.
8.  **Commit:** The transaction is committed to PostgreSQL.

### Step 3: Real-time Propagation (Backend -> Redis -> WS)

9.  Immediately after commit, `MatchService` serializes the updated `Match` model.
10. It publishes this JSON to Redis channel: `match_updates_{public_id}`.
11. The background WebSocket task in `main.py` (listening on this channel) picks up the message.
12. The message is forwarded to all open WebSockets connected to `/ws/matches/{public_id}`.

### Step 4: UI Update (Frontend)

13. `useMatchSocket.ts` receives the WebSocket message.
14. It calls `queryClient.setQueryData(['match', matchId], update)`.
15. React Query updates the cache instantly without a re-fetch.
16. React re-renders `Scoreboard.tsx` with the new score.

## 4. Key Data Models

### Match (Current State)

Represents the "Live" state of the game.

- `team_1_score`, `team_2_score`
- `server_number` (1 or 2)
- `serving_team` (1 or 2)

### MatchEvent (History)

An append-only log used for the **Undo** feature.

- `sequence_id`: Strict ordering.
- `score_snapshot`: Allows instant rollback by applying this snapshot to the `Match` table.

## 5. Undo Logic

1.  Frontend sends `POST .../undo`.
2.  Backend finds the _latest_ `MatchEvent`.
3.  It then finds the _previous_ `MatchEvent` (n-1).
4.  It applies `prev_event.score_snapshot` to the `Match` table.
5.  It deletes the latest event.
6.  The new (reverted) state is broadcast via Redis/WebSocket.
