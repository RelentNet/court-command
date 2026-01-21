# [DX] Audit Report

## Executive Summary (Health Score: 9/10)

The project has significantly improved its type safety and developer workflow. The pervasive use of `any` has been eliminated in favor of strict domain types mirrored from the backend. A robust linting and formatting pipeline is now enforced via husky pre-commit hooks.

Crucially, **automated API client generation** is now configured (`npm run gen:api`), allowing for seamless synchronization between the FastAPI backend and React frontend. Future work should focus on migrating existing manual `fetch` calls to the generated typed services.

## Critical Findings (Immediate Action)

### 1. "The `any` Plague" in Frontend

The `any` type is used extensively in core feature components, blinding the compiler and developers to the shape of data. This is the single biggest technical debt in the project.

**Locations:**

- `frontend/src/routes/courts.index.tsx` (Mapping `courts`)
- `frontend/src/routes/registry.index.tsx` (Mapping `players`, `teams`)
- `frontend/src/components/Scoreboard.tsx` (`match` prop)
- `frontend/src/components/MatchSetupForm.tsx` (`teams` processing)
- `frontend/src/components/DebugConsole.tsx` (`data` prop)

**Impact:**

- **Zero Autocomplete:** Developers must constantly `console.log` data to know its structure.
- **Runtime Errors:** Renaming a backend field (e.g., `team_1_score` -> `home_score`) will silently break the frontend without build errors.

### 2. Disconnected Data Contracts

The backend has rich, validated models in `backend/models.py` (e.g., `Match`, `Player`, `Court`), but the frontend redefines (or ignores) these contracts.

- **Backend:** `class Match(SQLModel): ...`
- **Frontend:** `match: any`

There is no "Single Source of Truth" for API responses.

## Optimization Suggestions (Long-term)

### 1. Automated Type Generation

Since the backend is FastAPI, it auto-generates an OpenAPI (Swagger) spec. We should leverage this to auto-generate TypeScript interfaces.

- **Tool:** `openapi-typescript-codegen` or `orval`.
- **Workflow:** Run a script `npm run gen:api` that fetches the local OpenAPI spec and builds typed hooks/interfaces.

### 2. Standardize Naming Conventions

The backend uses `snake_case` (Python standard), while the frontend likely prefers `camelCase`.

- **Current:** Frontend likely consuming `match.team_1_score` directly.
- **Better:** Use a transformation layer (or configure Pydantic/FastAPI) to serialize responses as `camelCase` to maintain JavaScript conventions, OR explicitly type the frontend interfaces to match the `snake_case` API response to avoid confusion.

### 3. Explicit Service/Query Layer in Frontend

Currently, data fetching logic seems ad-hoc. Centralizing API calls into strict "Query Hooks" (using TanStack Query) that return typed responses will encapsulate the API surface area.

## Progress Checklist

- [ ] **Phase 1: Stop the Bleeding**
  - [x] Create `frontend/src/types/domain.ts` and manually mirror the backend `models.py` classes.
  - [x] Replace `any` in `Scoreboard.tsx` with a proper `Match` interface.
  - [x] Replace `any` in `courts.index.tsx` and `registry.index.tsx`.

- [x] **Phase 2: Enforce Rigor**
  - [x] Enable `no-explicit-any` in ESLint configuration.
  - [x] Add a pre-commit hook (husky) to run `npm run check`.

- [x] **Phase 3: Automation**
  - [x] Set up a script to generate TypeScript types from the FastAPI `openapi.json`.
