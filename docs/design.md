# [DESIGN] Audit Report

## Executive Summary (Health Score: 9/10)

The "Match Completion" experience is currently functional but lacks clarity and flexibility. The "Reset" and "Return" buttons are ambiguous. The user requires a more structured workflow to handle the end of a match, specifically offering options to **Rematch** (play again immediately), **Save & Exit** (finalize and leave), or **Delete** (scrub the match entirely).

## Critical Findings (Immediate Action)

### 1. Ambiguous Post-Match Options
The current "Reset" (clears current match) and "Return" (leaves match as-is) flow is confusing.
- **Fix:** Replace the current modal actions with three distinct choices:
    1.  **Rematch:** Archives the current match and immediately starts a *new* match with the same teams and settings.
    2.  **Save & Exit:** Finalizes the match (locks it) and redirects the user to the Court Detail page.
    3.  **Delete Match:** Permanently deletes the match record and redirects to the Court Detail page.

## Optimization Suggestions (Long-term)

### 1. Match History Integration
Ensure that "Save & Exit" correctly updates the Court's `match_history` list so the user sees the result immediately upon returning.

## Progress Checklist

- [ ] **Phase 1: Backend Logic**
    - [ ] Create `POST /matches/{id}/rematch` endpoint (Clones config, archives current, returns new match).
    - [ ] Ensure `DELETE /matches/{id}` endpoint works for scrubbing.
    - [ ] Ensure `PATCH /matches/{id}/finalize` logic exists (or use existing status update).

- [ ] **Phase 2: Frontend UI**
    - [ ] Update `MatchContainer.tsx` to show the new "Match Complete" overlay with the 3 distinct buttons.
    - [ ] Implement confirmation dialog for "Delete Match".