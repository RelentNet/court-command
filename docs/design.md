# [DESIGN] Audit Report

## Executive Summary (Health Score: 9/10)

The Referee Interface is highly functional, but referees currently lack a quick way to swap Home/Away team assignments if they were entered incorrectly or if teams switch sides physically.

The goal is to implement a **"Swap Teams"** action that reverses the Team 1/Team 2 assignment while preserving the game state (scores, serving sequence relative to the new assignment).

## Critical Findings (Immediate Action)

### 1. Missing "Swap Sides" Feature
Referees cannot easily swap Team 1 (Home) and Team 2 (Away) without manually re-entering data.
- **Fix:** Implement a `swap_teams` endpoint in the backend and a prominent "Swap Sides" button in the `MatchConfigurationPanel`.

## Optimization Suggestions (Long-term)

### 1. Auto-Swap Logic
For "Best of 3" games, consider prompting the referee to swap sides automatically between games.

## Progress Checklist

- [ ] **Phase 1: Backend Logic**
    - [ ] Add `swap_teams(public_id)` method to `MatchService`.
    - [ ] Create `POST /matches/{id}/swap-teams` endpoint.
    - [ ] Ensure `team_1_id`, `team_2_id`, `team_1_score`, `team_2_score`, and `serving_team` are swapped atomically.

- [ ] **Phase 2: Frontend UI**
    - [ ] Add a "Swap Sides" button to `MatchConfigurationPanel` (likely near the team headers).
    - [ ] Wire up the button to the new endpoint.
