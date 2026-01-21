# CourtCommand API Documentation

This document outlines the API structure for the CourtCommand Pickleball System.

**Base URL:** `http://api.yourdomain.com` (or `http://localhost:8000` in dev)
**Protocol:** REST (JSON) & WebSockets

---

## 1. Registry Endpoints

Manage the entities that participate in matches.

### Players

- **GET `/players`**
  - Returns a list of all players.
- **POST `/players`**
  - Creates a new player.
  - **Payload:** `{ "display_name": "string", "handedness": "right" | "left", "skill_rating": float }`

### Teams

- **GET `/teams`**
  - Returns a list of all teams.
- **POST `/teams`**
  - Creates a new team.
  - **Payload:** `{ "name": "string", "short_name": "string", "logo_url": "string", "primary_color": "hex", "player_ids": [int] }`
- **GET `/teams/{team_id}`**
  - Returns details for a specific team.

---

## 2. Court Endpoints

Manage the physical/virtual locations where matches occur.

- **GET `/courts`**
  - Returns a list of `CourtSummary` objects.
  - **Response Fields:** `id`, `name`, `slug`, `created_at`, `is_active` (bool).
- **POST `/courts`**
  - Creates a new court.
  - **Payload:** `{ "name": "string" }`
  - **Note:** Automatically generates a URL-friendly `slug`.
- **GET `/courts/{slug}`**
  - Returns details for a specific court.
  - **Response Model:** `CourtWithMatch`
  - **Extra Fields:**
    - `active_match`: Full `Match` object if status is `in_progress`, else null.
    - `match_history`: List of up to 10 most recent completed `Match` objects.
- **DELETE `/courts/{slug}`**
  - Removes a court.

---

## 3. Match Endpoints

Core game logic and real-time state management.

### Management

- **POST `/matches`**
  - Initializes a new match.
  - **Payload:** (Optional) Partial Match model fields.
  - **Returns:** Full `Match` object including `public_id`.
- **GET `/matches/{public_id}`**
  - Returns the current state of a match.

### Game Actions

- **POST `/matches/{public_id}/point`**
  - Increments the score for the currently serving team.
  - Automatically handles game-over detection and archiving to `completed_games`.
- **POST `/matches/{public_id}/sideout`**
  - Switches the server number (1 -> 2) or switches the serving team.
- **POST `/matches/{public_id}/undo`**
  - Reverts the match to the state before the last event using history snapshots.

---

## 4. Real-time (WebSockets)

Instant updates for scoreboard tickers.

- **WS `/ws/matches/{public_id}`**
  - **Behavior:** On connection, it subscribes to a Redis channel for that match.
  - **Output:** Pushes the full `Match` JSON object every time the state changes (point, sideout, etc.).

---

## 5. Data Models (Key Fields)

### Match Object

```json
{
  "public_id": "uuid-string",
  "court_slug": "center-court",
  "status": "in_progress",
  "participants": {
    "team_1": { "name": "Apples", "id": 1 },
    "team_2": { "name": "Oranges", "id": 2 }
  },
  "config": {
    "points_to": 11,
    "win_by": 2,
    "format": "best_of_3"
  },
  "team_1_score": 0,
  "team_2_score": 0,
  "serving_team": 1,
  "server_number": 1,
  "completed_games": [
    { "game_num": 1, "score_team_1": 11, "score_team_2": 5, "winner": 1 }
  ]
}
```
