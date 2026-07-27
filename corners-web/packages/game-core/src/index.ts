export type RoomStatus = "waiting" | "active";

export interface RoomState {
  code: string;
  playerIds: string[];
  status: RoomStatus;
}

export type RoomMutationResult =
  | { ok: true; roomCode: string }
  | { ok: false; message: string };

export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
}

export interface ClientToServerEvents {
  "room:create": (acknowledge: (result: RoomMutationResult) => void) => void;
  "room:join": (
    request: { roomCode: string },
    acknowledge: (result: RoomMutationResult) => void,
  ) => void;
}

export interface GameState {
  phase: "waiting" | "playing" | "finished";
  boardVariant: "opposite-triangles";
  currentPlayerIndex: 0 | 1;
  winnerPlayerIndex: 0 | 1 | null;
}

export function createInitialGameState(): GameState {
  return {
    phase: "waiting",
    boardVariant: "opposite-triangles",
    currentPlayerIndex: 0,
    winnerPlayerIndex: null,
  };
}
