# Multiplayer Corners Web Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested mobile-first PWA and multiplayer room scaffold for a two-player «Уголки» web game.

**Architecture:** Use an npm workspace with a Vite TypeScript client, a Node Socket.IO server, and a shared framework-independent game-core package. Keep all application files under `corners-web/` and add one path-filtered CI workflow.

**Tech Stack:** Node.js 22.12+, TypeScript 6, Vite 8, Vitest 4, Socket.IO 4, vite-plugin-pwa 1.

## Global Constraints

- Do not modify the existing `drum-kit-android/` application.
- Keep the server authoritative for room and future move state.
- Use strict TypeScript and shared protocol types.
- Optimize the web interface for Android touch and portrait viewports.
- Do not implement full game rules in this scaffold.

---

### Task 1: Workspace and shared contracts

**Files:**
- Create: `corners-web/package.json`
- Create: `corners-web/tsconfig.base.json`
- Create: `corners-web/vitest.config.ts`
- Create: `corners-web/packages/game-core/src/index.ts`
- Test: `corners-web/packages/game-core/src/index.test.ts`

**Interfaces:**
- Produces: `RoomState`, `RoomMutationResult`, `ClientToServerEvents`, `ServerToClientEvents`, and `createInitialGameState()`.

- [x] Write the failing initial-state test.
- [x] Confirm the test detects an intentional regression.
- [x] Implement shared state and protocol types.
- [x] Run the test and confirm it passes.

### Task 2: Multiplayer room server

**Files:**
- Create: `corners-web/apps/server/src/room-store.ts`
- Create: `corners-web/apps/server/src/room-store.test.ts`
- Create: `corners-web/apps/server/src/index.ts`

**Interfaces:**
- Consumes: shared Socket.IO event types from `@corners/game-core`.
- Produces: HTTP `/health`, `room:create`, `room:join`, and `room:state` events.

- [x] Write tests for creation, second-player activation, and room capacity.
- [x] Confirm the tests detect an intentional regression.
- [x] Implement `RoomStore` and Socket.IO handlers.
- [x] Run the tests and confirm they pass.

### Task 3: Android-friendly PWA client

**Files:**
- Create: `corners-web/apps/web/index.html`
- Create: `corners-web/apps/web/src/main.ts`
- Create: `corners-web/apps/web/src/styles.css`
- Create: `corners-web/apps/web/vite.config.ts`
- Create: `corners-web/apps/web/public/icons/icon.svg`
- Create: `corners-web/apps/web/public/icons/icon-maskable.svg`

**Interfaces:**
- Consumes: `room:create`, `room:join`, and `room:state` protocol types.
- Produces: mobile room controls, connection feedback, and PWA assets.

- [x] Build the mobile shell with safe-area and large touch targets.
- [x] Connect room controls to the typed Socket.IO client.
- [x] Configure generated service worker and web app manifest.
- [x] Run static TypeScript verification.
- [x] Run the production client build after dependencies are available.

### Task 4: Validation and repository integration

**Files:**
- Create: `corners-web/README.md`
- Create: `.github/workflows/corners-web-validation.yml`

**Interfaces:**
- Produces: documented local commands and path-filtered automated validation.

- [x] Add `npm run check` for tests, type checking, and production build.
- [x] Add CI scoped to `corners-web/**`.
- [x] Verify core runtime behavior and static TypeScript correctness locally.
- [x] Verify dependency installation and the production build in GitHub Actions.
- [x] Commit the scaffold to `agent/multiplayer-corners-web-game`.
