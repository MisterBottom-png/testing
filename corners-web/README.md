# Corners Web

Mobile-first multiplayer web game inspired by «Уголки», isolated from the other experiments in this repository.

## Structure

- `apps/web` — Android-friendly PWA client built with Vite and TypeScript.
- `apps/server` — Socket.IO room server.
- `packages/game-core` — shared game state and socket protocol types.

## Run locally

```bash
npm install
npm run dev:server
npm run dev:web
```

The web client runs on `http://localhost:5173` and expects the multiplayer server at `http://localhost:3001` unless `VITE_SERVER_URL` is configured.

## Validation

```bash
npm run check
```

## Current scope

The scaffold supports multiplayer room creation and joining, a mobile shell, PWA metadata, shared protocol types, tests, and CI. Piece movement and complete «Уголки» rules are intentionally left for the next implementation phase.
