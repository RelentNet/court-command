# [QOL] Audit Report

## Executive Summary (Health Score: 8/10)

The application now features a polished loading experience with a dedicated `Spinner` component and has addressed critical accessibility gaps by adding `aria-labels` to icon-only buttons and inputs. The "feel" of the app is significantly improved.

Remaining work focuses on adding a global notification system and modernizing confirmation dialogs.

## Critical Findings (Immediate Action)

### 1. Missing Accessibility Labels

_(Resolved)_ Icon-only buttons are now visible to screen readers.

- **Location:** `frontend/src/routes/courts.index.tsx` (Delete button)
- **Issue:** Button containing `<Trash2 />` had no text.
- **Fix:** Added `aria-label="Delete court"`.

### 2. Missing Input Labels

_(Resolved)_ Inputs relying on placeholders now have accessibility attributes.

- **Location:** `frontend/src/routes/courts.index.tsx` (Create court input)
- **Fix:** Added `aria-label` to the input.

### 3. Primitive Loading & Error States

_(Resolved)_ Loading states now use a polished `<Spinner />` component.

- **Location:** `courts.index.tsx`, `MatchSetupForm.tsx`.
- **Fix:** Replaced plain text loading with `Spinner` component.

## Optimization Suggestions (Long-term)

### 1. Global Notification System

Users receive no feedback when actions succeed (e.g., "Court created successfully") or fail (apart from console errors).

- **Recommendation:** Integrate `sonner` or `react-hot-toast` to provide non-intrusive feedback.

### 2. Modernize Confirmation Dialogs

The use of `window.confirm()` halts the browser thread and looks unprofessional.

- **Recommendation:** Use a proper Modal/Dialog component (e.g., from `shadcn/ui` or `headlessui`).

## Progress Checklist

- [ ] **Phase 1: Accessibility & Feedback**
  - [x] Add `aria-label` to the delete button in `courts.index.tsx`.
  - [x] Add `aria-label` to the court creation input in `courts.index.tsx`.
  - [x] Add `aria-label` to "Point" buttons in `Scoreboard.tsx` to specify the team (e.g., "Add point for Team 1").

- [x] **Phase 2: Visual Polish**
  - [x] Create a reusable `<Spinner />` component.
  - [x] Replace text "Loading..." with `<Spinner />` in `courts.index.tsx` and `MatchSetupForm.tsx`.
