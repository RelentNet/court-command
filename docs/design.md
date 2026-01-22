# [DESIGN] Audit Report

## Executive Summary (Health Score: 8/10)

The Referee Interface is functional and robust, but the **Match Configuration Panel** has become dense. The "Team Selection" and "Player Creation" controls are crammed into a grid that feels overwhelming, especially when trying to quickly set up a match on a tablet.

The goal of this redesign is to **decompose the complexity**. Instead of one monolithic form, we will visually separate the concerns into distinct, clear zones.

## Critical Findings (Immediate Action)

### 1. Cluttered Configuration Panel
The current `MatchConfigurationPanel` mixes Team Selection, Player Assignment, Coin Toss, and Rules into one dense block.
- **Fix:** Split the panel into three distinct vertical sections (or "Cards"):
    1.  **Home Team** (Team 1 Selection & Players)
    2.  **Away Team** (Team 2 Selection & Players)
    3.  **Match Settings** (First Server & Series Length)

### 2. Dense Dropdowns
The player selection dropdowns are small and crowded next to each other.
- **Fix:** Use full-width rows for player selection within the Team Card, giving them breathing room.

## Optimization Suggestions (Long-term)

### 1. Stepper Workflow
For a brand new match, a "Wizard" or "Stepper" (Step 1: Teams -> Step 2: Settings -> Step 3: Start) might be even cleaner than a single page.

## Progress Checklist

- [ ] **Phase 1: Visual Restructuring**
    - [ ] Refactor `MatchConfigurationPanel` to use a `grid-cols-1 lg:grid-cols-3` layout for larger screens, stacking vertically on mobile/tablet.
    - [ ] Create a dedicated `<TeamConfigCard />` sub-component to encapsulate the logic for selecting a team and its players.
    - [ ] Create a `<MatchSettingsCard />` for the rules.

- [ ] **Phase 2: UI Polish**
    - [ ] Increase padding and font sizes for touch friendliness.
    - [ ] Use clearer visual grouping (borders/backgrounds) for Home vs Away.