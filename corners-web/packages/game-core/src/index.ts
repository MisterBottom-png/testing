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

export type HomeType = "3x3" | "3x4" | "1-2-3-4";
export type MovementType = "classic" | "diagonal";
export type PlayerIndex = 0 | 1;

export interface BoardCell {
  x: number;
  y: number;
}

export interface Move {
  from: number;
  to: number;
}

export interface GameState {
  phase: "playing" | "finished";
  homeType: HomeType;
  movementType: MovementType;
  pieces: number[];
  currentPlayerIndex: PlayerIndex;
  winnerPlayerIndex: PlayerIndex | null;
  moveCount: number;
  lastMove: (Move & { player: PlayerIndex }) | null;
}

export const BOARD_SIZE = 8;
export const BOARD_CELLS: BoardCell[] = Array.from(
  { length: BOARD_SIZE * BOARD_SIZE },
  (_, index) => ({ x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) }),
);

const INDEX_BY_COORD = new Map(
  BOARD_CELLS.map((cell, index) => [`${cell.x},${cell.y}`, index]),
);
const CAMP_CACHE = new Map<HomeType, readonly [Set<number>, Set<number>]>();
const ORTHOGONAL_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const DIAGONAL_DIRECTIONS = [
  ...ORTHOGONAL_DIRECTIONS,
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

export function indexAt(x: number, y: number): number {
  return INDEX_BY_COORD.get(`${x},${y}`) ?? -1;
}

function isHomeCell(homeType: HomeType, player: PlayerIndex, cell: BoardCell): boolean {
  if (homeType === "3x4") {
    return player === 0
      ? cell.x <= 2 && cell.y >= 4
      : cell.x >= 5 && cell.y <= 3;
  }
  if (homeType === "1-2-3-4") {
    return player === 0
      ? cell.y >= 4 && cell.x <= cell.y - 4
      : cell.y <= 3 && cell.x >= cell.y + 4;
  }
  return player === 0
    ? cell.x <= 2 && cell.y >= 5
    : cell.x >= 5 && cell.y <= 2;
}

export function getCamps(homeType: HomeType): readonly [Set<number>, Set<number>] {
  const cached = CAMP_CACHE.get(homeType);
  if (cached) return cached;
  const camps = [0, 1].map((player) => new Set(
    BOARD_CELLS
      .map((cell, index) => (isHomeCell(homeType, player as PlayerIndex, cell) ? index : -1))
      .filter((index) => index >= 0),
  )) as [Set<number>, Set<number>];
  CAMP_CACHE.set(homeType, camps);
  return camps;
}

export function getPieceCount(homeType: HomeType): number {
  return getCamps(homeType)[0].size;
}

function directionsFor(movementType: MovementType) {
  return movementType === "diagonal" ? DIAGONAL_DIRECTIONS : ORTHOGONAL_DIRECTIONS;
}

export function createInitialGameState(
  homeType: HomeType = "3x3",
  movementType: MovementType = "classic",
): GameState {
  const pieces = Array<number>(BOARD_CELLS.length).fill(0);
  const camps = getCamps(homeType);
  for (const index of camps[0]) pieces[index] = 1;
  for (const index of camps[1]) pieces[index] = 2;
  return {
    phase: "playing",
    homeType,
    movementType,
    pieces,
    currentPlayerIndex: 0,
    winnerPlayerIndex: null,
    moveCount: 0,
    lastMove: null,
  };
}

function jumpDestinations(state: GameState, fromIndex: number): Set<number> {
  const visited = new Set([fromIndex]);
  const queue = [fromIndex];
  const results = new Set<number>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const cell = BOARD_CELLS[current];
    for (const [dx, dy] of directionsFor(state.movementType)) {
      const middle = indexAt(cell.x + dx, cell.y + dy);
      const landing = indexAt(cell.x + dx * 2, cell.y + dy * 2);
      if (middle < 0 || landing < 0 || state.pieces[middle] === 0) continue;
      const occupied = landing === fromIndex ? false : state.pieces[landing] !== 0;
      if (occupied || visited.has(landing)) continue;
      visited.add(landing);
      results.add(landing);
      queue.push(landing);
    }
  }
  return results;
}

export function getLegalDestinations(
  state: GameState,
  fromIndex: number,
  ignoreTurn = false,
): number[] {
  if (state.phase !== "playing" || fromIndex < 0 || fromIndex >= BOARD_CELLS.length) return [];
  const piece = state.pieces[fromIndex];
  if (piece === 0) return [];
  const player = (piece - 1) as PlayerIndex;
  if (!ignoreTurn && player !== state.currentPlayerIndex) return [];

  const from = BOARD_CELLS[fromIndex];
  const results = new Set<number>();
  for (const [dx, dy] of directionsFor(state.movementType)) {
    const destination = indexAt(from.x + dx, from.y + dy);
    if (destination >= 0 && state.pieces[destination] === 0) results.add(destination);
  }
  for (const destination of jumpDestinations(state, fromIndex)) results.add(destination);
  return [...results];
}

export function isWinningPosition(state: GameState, player: PlayerIndex): boolean {
  const target = getCamps(state.homeType)[player === 0 ? 1 : 0];
  return [...target].every((index) => state.pieces[index] === player + 1);
}

export function applyMove(state: GameState, move: Move): boolean {
  const player = state.currentPlayerIndex;
  if (state.pieces[move.from] !== player + 1) return false;
  if (!getLegalDestinations(state, move.from).includes(move.to)) return false;
  state.pieces[move.to] = state.pieces[move.from];
  state.pieces[move.from] = 0;
  state.moveCount += 1;
  state.lastMove = { ...move, player };
  if (isWinningPosition(state, player)) {
    state.phase = "finished";
    state.winnerPlayerIndex = player;
  } else {
    state.currentPlayerIndex = player === 0 ? 1 : 0;
  }
  return true;
}
