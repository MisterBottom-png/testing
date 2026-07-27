const BOARD_SIZE = 8;
const DEFAULT_HOME_TYPE = '3x3';
const DEFAULT_MOVEMENT_TYPE = 'classic';

const HOME_TYPES = Object.freeze({
  '3x3': { label: '3×3', description: 'Квадрат, 9 шашек' },
  '3x4': { label: '3×4', description: 'Прямоугольник, 12 шашек' },
  '1-2-3-4': { label: '1–2–3–4', description: 'Треугольник, 10 шашек' },
});

const MOVEMENT_TYPES = Object.freeze({
  classic: { label: 'Классические', description: 'Только по вертикали и горизонтали' },
  diagonal: { label: 'Диагональные', description: 'Также разрешены диагонали' },
});

const HOLES = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
  x: index % BOARD_SIZE,
  y: Math.floor(index / BOARD_SIZE),
}));

const INDEX_BY_COORD = new Map(HOLES.map((cell, index) => [`${cell.x},${cell.y}`, index]));

const CAMP_CACHE = new Map();
const ORTHOGONAL_DIRECTIONS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const DIAGONAL_DIRECTIONS = Object.freeze([
  ...ORTHOGONAL_DIRECTIONS,
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]);

function indexAt(x, y) {
  return INDEX_BY_COORD.get(`${x},${y}`) ?? -1;
}

function normalizeHomeType(homeType) {
  return Object.hasOwn(HOME_TYPES, homeType) ? homeType : DEFAULT_HOME_TYPE;
}

function normalizeMovementType(movementType) {
  return Object.hasOwn(MOVEMENT_TYPES, movementType) ? movementType : DEFAULT_MOVEMENT_TYPE;
}

function isHomeCell(homeType, player, cell) {
  if (homeType === '3x4') {
    return player === 0
      ? cell.x <= 2 && cell.y >= 4
      : cell.x >= 5 && cell.y <= 3;
  }
  if (homeType === '1-2-3-4') {
    return player === 0
      ? cell.y >= 4 && cell.x <= cell.y - 4
      : cell.y <= 3 && cell.x >= cell.y + 4;
  }
  return player === 0
    ? cell.x <= 2 && cell.y >= 5
    : cell.x >= 5 && cell.y <= 2;
}

function getCamps(homeType = DEFAULT_HOME_TYPE) {
  const normalized = normalizeHomeType(homeType);
  if (!CAMP_CACHE.has(normalized)) {
    CAMP_CACHE.set(normalized, [0, 1].map((player) => new Set(
      HOLES
        .map((cell, index) => (isHomeCell(normalized, player, cell) ? index : -1))
        .filter((index) => index >= 0),
    )));
  }
  return CAMP_CACHE.get(normalized);
}

const CAMPS = getCamps(DEFAULT_HOME_TYPE);
const PIECES_PER_PLAYER = CAMPS[0].size;

function getPieceCount(homeType = DEFAULT_HOME_TYPE) {
  return getCamps(homeType)[0].size;
}

function directionsFor(state) {
  return normalizeMovementType(state.movementType) === 'diagonal'
    ? DIAGONAL_DIRECTIONS
    : ORTHOGONAL_DIRECTIONS;
}

function cloneState(state) {
  return {
    ...state,
    pieces: [...state.pieces],
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

function createInitialState(mode = 'local', options = {}) {
  const homeType = normalizeHomeType(options.homeType);
  const movementType = normalizeMovementType(options.movementType);
  const camps = getCamps(homeType);
  const pieces = Array(HOLES.length).fill(0);
  for (const index of camps[0]) pieces[index] = 1;
  for (const index of camps[1]) pieces[index] = 2;
  return {
    version: 4,
    gameId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    homeType,
    movementType,
    phase: 'playing',
    pieces,
    currentPlayer: 0,
    winner: null,
    moveCount: 0,
    startedAt: Date.now(),
    lastMove: null,
  };
}

function jumpDestinations(state, fromIndex) {
  const visited = new Set([fromIndex]);
  const queue = [fromIndex];
  const results = new Set();

  while (queue.length) {
    const current = queue.shift();
    const cell = HOLES[current];
    for (const [dx, dy] of directionsFor(state)) {
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

function getLegalDestinations(state, fromIndex, { ignoreTurn = false } = {}) {
  if (state.phase !== 'playing' || fromIndex < 0 || fromIndex >= HOLES.length) return [];
  const piece = state.pieces[fromIndex];
  if (!piece) return [];
  const player = piece - 1;
  if (!ignoreTurn && player !== state.currentPlayer) return [];

  const from = HOLES[fromIndex];
  const results = new Set();
  for (const [dx, dy] of directionsFor(state)) {
    const destination = indexAt(from.x + dx, from.y + dy);
    if (destination >= 0 && state.pieces[destination] === 0) results.add(destination);
  }
  for (const destination of jumpDestinations(state, fromIndex)) results.add(destination);
  return [...results];
}

function isWinningPosition(state, player) {
  const targetCamp = getCamps(state.homeType)[player === 0 ? 1 : 0];
  for (const index of targetCamp) {
    if (state.pieces[index] !== player + 1) return false;
  }
  return true;
}

function applyMove(state, from, to) {
  if (state.phase !== 'playing') return { ok: false, message: 'Игра уже завершена.' };
  if (state.pieces[from] !== state.currentPlayer + 1) {
    return { ok: false, message: 'Сейчас ход другого игрока.' };
  }
  if (!getLegalDestinations(state, from).includes(to)) {
    return { ok: false, message: 'Так ходить нельзя.' };
  }

  const player = state.currentPlayer;
  state.pieces[to] = state.pieces[from];
  state.pieces[from] = 0;
  state.moveCount += 1;
  state.lastMove = { from, to, player };

  if (isWinningPosition(state, player)) {
    state.phase = 'finished';
    state.winner = player;
  } else {
    state.currentPlayer = player === 0 ? 1 : 0;
  }
  return { ok: true };
}

function getAllLegalMoves(state, player = state.currentPlayer) {
  const moves = [];
  for (let from = 0; from < state.pieces.length; from += 1) {
    if (state.pieces[from] !== player + 1) continue;
    for (const to of getLegalDestinations(state, from, { ignoreTurn: true })) moves.push({ from, to });
  }
  return moves;
}

function distanceToTarget(state, player, index) {
  const cell = HOLES[index];
  const targetCamp = getCamps(state.homeType)[player === 0 ? 1 : 0];
  let best = Infinity;
  for (const targetIndex of targetCamp) {
    const target = HOLES[targetIndex];
    const dx = Math.abs(cell.x - target.x);
    const dy = Math.abs(cell.y - target.y);
    const distance = state.movementType === 'diagonal' ? Math.max(dx, dy) : dx + dy;
    best = Math.min(best, distance);
  }
  return best;
}

function evaluateState(state, player) {
  const camps = getCamps(state.homeType);
  const ownTarget = camps[player === 0 ? 1 : 0];
  const ownHome = camps[player];
  let score = 0;
  for (let index = 0; index < state.pieces.length; index += 1) {
    if (state.pieces[index] !== player + 1) continue;
    score -= distanceToTarget(state, player, index) * 9;
    if (ownTarget.has(index)) score += 70;
    if (!ownHome.has(index)) score += 6;
  }
  return score;
}

function chooseBotMove(state, difficulty = 'smart') {
  const moves = getAllLegalMoves(state, state.currentPlayer);
  if (!moves.length) return null;
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];

  const player = state.currentPlayer;
  const scored = moves.map((move) => {
    const simulated = cloneState(state);
    applyMove(simulated, move.from, move.to);
    let score = evaluateState(simulated, player);
    if (simulated.winner === player) score += 100000;

    const opponentMoves = getAllLegalMoves(simulated, simulated.currentPlayer);
    let opponentBest = -Infinity;
    for (const response of opponentMoves.slice(0, 48)) {
      const reply = cloneState(simulated);
      applyMove(reply, response.from, response.to);
      opponentBest = Math.max(opponentBest, evaluateState(reply, simulated.currentPlayer));
    }
    if (Number.isFinite(opponentBest)) score -= opponentBest * 0.18;
    score += Math.random() * 0.5;
    return { ...move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}
