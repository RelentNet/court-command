# [DESIGN] Audit Report

## Executive Summary (Health Score: 8/10)

The Registry system has made great progress, but a critical regression has surfaced in the **Team Editing** workflow. The UI fails to reflect the "Edit" state, showing "Create Team" instead of "Update Team". Consequently, submitting the form attempts to create a *new* team with an existing name, triggering a backend conflict (`400 Bad Request`).

The goal is to fix the `TeamEditor` state detection to ensure it correctly identifies when it is editing an existing record.

## Critical Findings (Immediate Action)

### 1. "Edit" Mode Not Detected
The `TeamEditor` component displays "Create Team" even when editing.
- **Root Cause:** The `initialData.id` prop might be missing or not checked correctly in the render logic.
- **Fix:** Debug `TeamEditor.tsx` to ensure `initialData?.id` is correctly determining the button text and mutation logic.

### 2. Mutation Logic Flaw
The logs show `POST /teams` being called instead of `PUT /teams/{id}`.
- **Root Cause:** The `createMutation` logic in `TeamEditor.tsx` is defaulting to `POST` because it thinks `initialData.id` is falsy.
- **Fix:** Trace the prop drilling from `registry.index.tsx` -> `TeamEditor.tsx`.

## Progress Checklist

- [ ] **Phase 1: Diagnosis & Fix**
    - [ ] Inspect `frontend/src/routes/registry.index.tsx` to ensure the full team object (including ID) is passed to `TeamEditor`.
    - [ ] Inspect `frontend/src/components/TeamEditor.tsx` to verify how `initialData.id` controls the UI and API call.