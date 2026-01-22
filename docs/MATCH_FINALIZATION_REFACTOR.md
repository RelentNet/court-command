# Match Finalization & State Locking

## 1. The Issue: "Zombie Matches"

Currently, when a match transitions to `final`:
*   **Backend:** It stops processing game-over logic but might still accept points (bad).
*   **Frontend:** The UI remains fully active, allowing referees to click "Point Scored" indefinitely, corrupting the `completed_games` history.

## 2. Requirements

### Frontend (Referee View)
When `match.status === 'final'`:
1.  **Lock Scoreboard:** Disable "Point Scored" and "Side Out" buttons.
2.  **Visual Indicator:** Display a prominent "MATCH COMPLETE" banner or overlay.
3.  **Summary View:** Show the final result (e.g., "Team 1 wins 2-1").
4.  **Post-Match Actions:**
    *   **"Reset Match"**: (Already exists) To start over.
    *   **"Return to Court"**: Link back to the court dashboard.

### Backend (Safety)
1.  **Validation:** `add_point` and `side_out` endpoints must throw an error (400 Bad Request) if `match.status == 'final'`.

## 3. Implementation Plan

### Step 1: Backend Hardening (`match_service.py`)
*   Add a check at the start of `add_point` and `side_out`.
*   If `match.status == 'final'`, raise `HTTPException(400, "Match is already finalized")`.

### Step 2: Frontend UI Update (`MatchContainer.tsx` & `Scoreboard.tsx`)
*   **Scoreboard:** If `match.status === 'final'`, force `readonly={true}`.
*   **MatchContainer:**
    *   Hide "Undo" button (or limit its scope).
    *   Hide Action Buttons ("Point Scored", "Side Out").
    *   Render a `<MatchFinalBanner />` component.

## 4. Execution Steps

1.  **Backend:** Add status check guard clauses.
2.  **Frontend:** Update `MatchContainer` logic to treat `final` matches as readonly.
3.  **Frontend:** Create a simple "Match Complete" banner.
