# Match Start & Series Configuration Logic

## 1. The Issue: "Perpetual Warm-up"

Currently, matches are created in `warm_up` status.
*   **Problem:** The system never transitions them to `in_progress`.
*   **Result:** The game logic might behave differently (or not at all) if it expects `in_progress`.
*   **Requirement:** We need an explicit "Start Match" action or an implicit transition when the first point is scored. Given the "Referee Command Center" model, an explicit start button is safer.

## 2. Series Length Configuration

The user needs to set "Best of 1", "Best of 3", or "Best of 5".
*   **Location:** `MatchConfigurationPanel.tsx`
*   **Data Point:** `match.config.format` (string: "best_of_1", "best_of_3", etc.)

## 3. Implementation Plan

### Backend Changes (`match_service.py`)
*   **Status Transition:** The `add_point` method should check if `status == "warm_up"` and auto-transition to `in_progress` on the first point?
    *   *Decision:* **Yes**, this is the most fluid UX. If points are being scored, the match is on.
*   **Explicit Start:** Also allow the `configure_match` endpoint to accept `status="in_progress"` to manually start it (e.g. to start the timer).

### Frontend Changes (`MatchConfigurationPanel.tsx`)
*   **Series Select:** Add a dropdown or button group for "Format":
    *   Best of 1
    *   Best of 3
    *   Best of 5
*   **Start Button:** If match is in `warm_up`, show a big green "Start Match" button in the configuration panel (or replace the "Update" button with "Start & Update").

## 4. Execution Steps

1.  **Frontend:** Update `MatchConfigurationPanel` to include "Best of X" selection.
2.  **Backend:** Ensure `configure_match` updates the `config` JSON column correctly.
3.  **Backend:** Update `add_point` in `MatchService` to auto-switch status from `warm_up` -> `in_progress`.
