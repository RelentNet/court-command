# [DESIGN] Audit Report

## Executive Summary (Health Score: 8/10)

The Referee Interface is functional and robust, but the **Team Configuration Card** has usability friction on touch devices. The actions for creating new teams/players ("+ New") and swapping positions ("Swap") are currently small text buttons that are hard to tap and visually ambiguous.

The goal of this redesign is to **optimize for touch targets**. We will replace small text links with distinct, thumb-friendly action areas.

## Critical Findings (Immediate Action)

### 1. Small Touch Targets
The "+ New" and "Swap" buttons are essentially text links with tiny icons. On a tablet, these are difficult to hit accurately without accidentally triggering nearby inputs.
- **Fix:** Replace the "Swap" text button with a large, centered, dedicated Swap Action Button between the player inputs.
- **Fix:** Replace the "+ New" text button with a prominent "Create" button or icon-button with sufficient padding.

### 2. Visual Ambiguity
The "Swap" button is tucked away in the header, disconnected from the players it actually affects (Player 1 & Player 2).
- **Fix:** Move the Swap action physically *between* the Player 1 and Player 2 dropdowns to visually indicate its function.

## Optimization Suggestions (Long-term)

### 1. Drag-and-Drop Reordering
For swapping players, a drag-and-drop interface would be the most intuitive gesture on a tablet, though harder to implement than a button.

## Progress Checklist

- [ ] **Phase 1: Component Restructuring**
    - [ ] Update `TeamConfigCard.tsx` layout to separate the "Swap" action from the header.
    - [ ] Place a large `<SwapButton />` between the Player 1 and Player 2 selectors.
    - [ ] Redesign the "+ New" button to be a distinct action button next to the Team Select dropdown or as a prominent footer action.

- [ ] **Phase 2: Visual Polish**
    - [ ] Increase padding on all select inputs for tablet friendliness.
    - [ ] Ensure buttons have active states (scale/color) for feedback.
