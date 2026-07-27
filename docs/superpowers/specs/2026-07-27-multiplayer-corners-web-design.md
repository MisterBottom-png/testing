# Multiplayer Corners Web Game Design

## Goal

Create an isolated, mobile-first foundation for a two-player web game inspired by «Уголки». The application must run well in Android browsers, be installable as a PWA, and support online rooms without altering the existing drum-kit project.

## Scope of this scaffold

The first branch provides the application boundaries, development tooling, mobile shell, PWA manifest, shared TypeScript contracts, room creation/joining, automated tests, and CI. It deliberately does not implement piece movement, jump chains, turn validation, victory detection, accounts, matchmaking, chat, or persistence.

## Architecture

The project lives under `corners-web/` as an npm workspace with three isolated units:

1. `apps/web`: Vite and TypeScript client. It owns rendering, Android-friendly interaction, PWA installation, and Socket.IO client communication.
2. `apps/server`: Node HTTP and Socket.IO service. It owns room membership and authoritative multiplayer session state.
3. `packages/game-core`: framework-independent types and future game rules shared by client and server.

The existing repository root and `drum-kit-android/` application remain untouched except for one path-filtered GitHub Actions workflow.

## Multiplayer flow

A player creates a room and receives a six-character code. The server stores the host socket ID and marks the room as waiting. A second player joins with the code, after which the room becomes active and the server broadcasts the room state to both clients. The server remains authoritative; future move validation must also live server-side and use pure functions from `game-core`.

## Mobile and PWA design

The client uses safe-area insets, large touch targets, portrait-first layout, responsive desktop fallback, installable PWA metadata, and local visual feedback for connectivity. No native Android wrapper is required for the first version.

## Error handling

Room codes are normalized to uppercase. Unknown and full rooms return explicit Russian-language errors. The client exposes connection loss and relies on Socket.IO reconnection. Room cleanup and reconnection identity are deferred to the next phase.

## Testing

`game-core` tests verify initial state. Server tests verify room creation, activation, and capacity. TypeScript strict mode validates contracts across workspaces. Vite production build validates the client and PWA generation.

## Success criteria

- The new game is isolated under `corners-web/`.
- `npm run check` passes.
- A user can create or join a two-player room locally.
- The client is usable on an Android-sized viewport and includes PWA metadata.
- CI runs only when `corners-web/**` or its workflow changes.
