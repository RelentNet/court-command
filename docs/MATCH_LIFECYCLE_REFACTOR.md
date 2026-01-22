# Match Lifecycle & UI Flow Refactor

## 1. Status Rename: `warm_up` -> `preparing`

To better reflect the state where the match is being set up but hasn't started, we will rename the initial status.
*   **Database:** Update default status in `Match` model.
*   **Logic:** Update `MatchService` to handle `preparing` -> `in_progress`.

## 2. The "Locked" Workflow

The Referee Interface will have two distinct modes based on `match.status`:

### Mode A: Preparing (Pre-Match)
*   **Configuration Panel:** Fully open and editable.
*   **Scoreboard:** Disabled / Dimmed / Hidden (or shows "Waiting to Start").
*   **Action Buttons:** Hidden (Side Out, Point Scored).
*   **Primary Action:** "Start Match" (Big Green Button).

### Mode B: In Progress (Live Match)
*   **Configuration Panel:** Collapsed by default (Accordion style).
    *   **Locked Fields:** "Series Length" and "First Server" are read-only.
    *   **Editable Fields:** Team/Player selection (to fix roster mistakes).
*   **Scoreboard:** Fully active.
*   **Action Buttons:** Visible and active.
*   **Primary Action:** "Reset Match" (to go back to `preparing`).

## 3. Implementation Steps

### Backend
1.  **Model:** Change default `status` to `preparing` (requires DB migration/reset or careful handling). *Actually, let's keep `warm_up` as the string in DB for now to avoid schema reset, just treat it as "Preparing" in UI, OR do a full migration.* -> **Decision:** Let's rename it to `preparing` in code and do a DB reset since we are in dev.
2.  **Service:** Update transitions.

### Frontend
1.  **State Management:**
    *   Check `match.status`.
    *   If `preparing`:
        *   Show Config Panel (Open).
        *   Hide/Disable Scoreboard Controls.
    *   If `in_progress`:
        *   Show Config Panel (Collapsed/Summary).
        *   Render Config Panel with `readOnly` props for specific sections.
        *   Show Scoreboard Controls.
2.  **MatchConfigurationPanel:**
    *   Add `isStarted` prop.
    *   Conditionally render inputs as text or disabled inputs when `isStarted` is true.
    *   Allow Team/Player selects to remain active.
