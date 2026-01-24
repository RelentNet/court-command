# [CLEANCODE] Refactoring Audit

## Executive Summary (Cleanliness Score: 9/10)

The CourtCommand codebase has been significantly refactored. The "God Component" `MatchContainer` has been decomposed, redundant hooks have been unified, and backend logic has been modularized. The system is now much more maintainable and testable.

## Completed Refactoring
- **Duplicate Hooks**: Unified `useMatchSocket.ts` and `useCourtSocket.ts` into `useWebSocket.ts`.
- **WebSocket Boilerplate**: Refactored `backend/main.py` to use a shared `handle_websocket_subscription` function.
- **Service Repetition**: `MatchService` now uses `_commit_and_broadcast` and `PickleballEngine` to reduce boilerplate and isolate logic.
- **Placeholder Components**: Removed `ControlPanel.tsx`.
- **Extraction**:
  - `MatchCompletionBanner`, `MatchRefereeHeader`, `ActionButtons` extracted from `MatchContainer`.
  - `PlayerCard` extracted from `Scoreboard`.
  - `PickleballEngine` extracted to `backend/logic/pickleball.py`.
  - Pydantic schemas moved to `backend/schemas.py`.

## Simplification Achievements
- **Schema Standardization**: Schemas are now central in `backend/schemas.py`.
- **Event Sourcing Cleanup**: `undo_last_event` uses a clean `_restore_snapshot` method.

## Cleanup Checklist

- [x] Create `frontend/src/hooks/useWebSocket.ts` and delete `useMatchSocket`/`useCourtSocket`.
- [x] Refactor `MatchContainer.tsx` by extracting at least 3 sub-components.
- [x] Extract `PlayerCard` from `Scoreboard.tsx`.
- [x] Move Pydantic models from `main.py` to `schemas.py`.
- [x] Create `backend/logic/pickleball.py` to house game rules.
- [x] Implement a decorator or context manager for `MatchService` mutations to handle boilerplate (lock, commit, broadcast).
- [x] Remove or implement `ControlPanel.tsx` placeholders.