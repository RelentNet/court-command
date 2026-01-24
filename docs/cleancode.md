# [CLEANCODE] Refactoring Audit

## Executive Summary (Cleanliness Score 6/10)

The CourtCommand codebase utilizes a modern and robust stack (FastAPI, React 19, Vite, TanStack Query/Router). However, it exhibits classic signs of rapid prototyping: "God Components" in the frontend that mix UI, state, and network logic, and a backend Service layer that conflates persistence, business rules, and broadcasting. Additionally, there is ambiguity in the domain logic (Pickleball vs. Padel rotation rules).

## Deadwood & Redundancy

### Backend

- **`backend/services/match_service.py`**:
  - **`rematch` vs `reset_match`**: The `rematch` method manually resets score fields (0-0, server 1, etc.), duplicating the logic found in `reset_match`. This violates DRY.
  - **`swap_teams`**: This method manually swaps `team_1_id`/`team_2_id` and iterates through `completed_games` to swap scores dictionary-style. This is brittle and verbose.
- **`backend/models.py` & `backend/services/match_service.py`**:
  - **Hardcoded Status Strings**: strings like `"preparing"`, `"in_progress"`, and `"final"` are scattered. These should be a shared Enum.

### Frontend

- **`frontend/src/components/MatchContainer.tsx`**:
  - **Mutation Duplication**: The component defines `actionMutation` and `rematchMutation` locally. This logic is coupled to the view and un-reusable.
- **`frontend/src/reportWebVitals.ts`**:
  - **Boilerplate**: Standard CRA/Vite boilerplate that appears unused in the actual application monitoring strategy.

## Extraction Opportunities

### Frontend Hooks

- **`useMatch(matchId)`**: Extract the `useQuery` (fetch), `useWebSocket` (real-time), and `useMutation` (actions) logic from `MatchContainer.tsx` into a dedicated custom hook.
  - **Benefit**: Decouples data fetching/syncing from the UI.

### Frontend Components

- **Split `MatchContainer.tsx`**:
  - Currently, `MatchContainer` acts as a "God Component" handling both Referee (interactive) and Scoreboard (read-only) modes via a `readonly` prop and excessive conditional rendering (`{!readonly && ...}`).
  - **Proposal**: Split into `<RefereeView />` and `<ScoreboardView />`.
  - **Benefit**: Removes complex conditional rendering and makes each component focused on a single use case.

## Simplification Proposals

### Backend Architecture

- **`MatchService` Responsibilities**: Currently handles Database locking, Redis broadcasting, _and_ business logic.
  - **Proposal**: Move pure game logic (points, sideouts, rule enforcement) entirely into `PickleballEngine`. The Service should only orchestrate (Load Match -> Apply Engine Rule -> Save -> Broadcast).
- **`PickleballEngine` Logic**:
  - The `process_side_out` method implements "Alternating Team Rotation (Padel Style)". This contradicts standard Pickleball side-out rules (Server 1 -> Server 2 -> Sideout).
  - **Proposal**: Clarify requirements. If this is a specific variant, rename/document explicitly. If standard Pickleball, simplify to standard rules.

### Frontend State

- **Optimistic Updates**: `MatchContainer` performs optimistic updates but lacks a robust rollback mechanism aside from re-fetching.
  - **Proposal**: Centralize optimistic logic in the proposed `useMatch` hook.

## Cleanup Checklist

- [ ] **Frontend**: Extract `useMatch` hook from `MatchContainer.tsx`.
- [ ] **Frontend**: Split `MatchContainer` into `RefereeView` and `ScoreboardView`.
- [ ] **Backend**: Create `MatchStatus` Enum and refactor `models.py` / `match_service.py`.
- [ ] **Backend**: Refactor `MatchService.swap_teams` to use a helper or model method.
- [ ] **Backend**: Deduplicate initialization logic between `rematch` and `reset_match`.
- [ ] **Documentation**: Clarify "Padel Style" rotation logic in `PickleballEngine`.
