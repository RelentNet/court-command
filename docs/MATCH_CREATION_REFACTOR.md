# Match Creation & Referee Interface Refactor Plan

## 1. The Core Shift: "Lazy Configuration"

**Current Flow:**
1.  User selects Court.
2.  User *must* select Teams, Players, and Rules *before* creating the match.
3.  Match is created -> Redirect to Referee.

**New Desired Flow:**
1.  User selects Court -> Clicks "Start Match".
2.  **Match is created immediately** with placeholder/null teams.
3.  User is redirected to `/courts/$courtSlug/referee`.
4.  **Referee Interface** is the "Command Center":
    *   Select Team 1 & Team 2 (Dropdowns).
    *   Select Player 1 & Player 2 for each team (Dropdowns).
    *   Toggle: "Who serves first?" (Team 1 or Team 2).
    *   Toggle: "Swap First Server" (Player A or Player B starts).

---

## 2. Database Schema Updates (`models.py`)

We need to store the granular state of "Who is where?" not just "What is the score?".

### `Match` Model Changes
We need a more robust `participants` structure or explicit columns to track active players.

```python
class Match(SQLModel, table=True):
    # ... existing fields ...
    
    # Track specific player IDs in specific positions
    # (Optional, but cleaner than JSON for specific logic)
    serving_team_id: Optional[int] = None
    first_server_team_1_id: Optional[int] = None # Which player serves first for T1
    first_server_team_2_id: Optional[int] = None # Which player serves first for T2
```

*For now, we can stick to the `participants` JSON column but we must standardize its shape:*

```json
{
  "team_1": {
    "id": 10,
    "name": "Eagles",
    "player_1": { "id": 101, "name": "John" },
    "player_2": { "id": 102, "name": "Doe" }
  },
  "team_2": { ... }
}
```

---

## 3. API Changes (`match_service.py`)

### `POST /matches` (Simplified)
*   **Request:** Only needs `court_slug`.
*   **Logic:** Creates a match with `status="warm_up"` (or `in_progress`). Teams can be null.

### `PATCH /matches/{public_id}/configure` (New)
*   **Purpose:** Updates the teams, players, and serving configuration dynamically.
*   **Payload:**
    ```json
    {
      "team_1_id": 10,
      "team_2_id": 20,
      "server_preference": {
        "first_serving_team": 1, // 1 or 2
        "team_1_first_server_idx": 0, // 0 (Player 1) or 1 (Player 2)
        "team_2_first_server_idx": 0
      }
    }
    ```

---

## 4. Frontend Components (`Referee` View)

The Referee view needs to handle two states: **Setup Mode** and **Live Mode**.

### State A: Setup Mode (Validation)
If teams are not selected, the "Scoreboard Controls" are disabled/hidden. Instead, we show:

*   **Team Selectors:**
    *   `<TeamSelect label="Team 1" onChange={...} />`
    *   `<TeamSelect label="Team 2" onChange={...} />`
*   **Player Selectors:**
    *   (Derived from Team selection)
*   **Coin Toss / Server Controls:**
    *   "Who Serves First?" [Team 1] [Team 2]
    *   "First Server" [Player A] [Player B]

### State B: Live Mode
Once valid teams are selected, the scoreboard becomes active.
*   **Note:** The selectors should remain accessible (perhaps collapsible) so the ref can fix mistakes (e.g., "Oh wait, wrong player is serving").

---

## 5. Execution Steps

1.  **Backend:** Update `create_match` to allow optional participants.
2.  **Backend:** Create `update_match_configuration` endpoint.
3.  **Frontend (`MatchSetupForm`):** Deprecate/Remove. Replace "Start Match" button on Court page to just create an empty match and redirect.
4.  **Frontend (`MatchContainer`):** Add a `<MatchConfigurationPanel />` component that renders when teams are missing or requested.
5.  **Frontend (`Referee`):** Integrate the configuration panel above the scoreboard.
