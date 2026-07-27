const ROW_LENGTHS = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
const ROW_STARTS = [12, 11, 10, 9, 0, 1, 2, 3, 4, 3, 2, 1, 0, 9, 10, 11, 12];

const HOLES = ROW_LENGTHS.flatMap((length, y) =>
  Array.from({ length }, (_, i) => ({ x: ROW_STARTS[y] + i * 2, y })),
);

const INDEX_BY_COORD = new Map(HOLES.map((hole, index) => [`${hole.x},${hole.y}`, index]));
const CAMPS = [
  new Set(HOLES.map((hole, index) => (hole.y <= 3 ? index : -1)).filter((index) => index >= 0)),
  new Set(HOLES.map((hole, index) => (hole.y >= 13 ? index : -1)).filter((index) => index >= 0)),
];

const STEP_DIRECTIONS = [
  [2, 0], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1],
];

function indexAt(x, y) {
  return INDEX_BY_COORD.get(`${x},${y}`) ?? -1;
}

function cloneState(state) {
  return {
    ...state,
    pieces: [...state.pieces],
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

function createInitialState(mode = 'local') {
  const pieces = Array(HOLES.length).fill(0);
  for (const index of CAMPS[0]) pieces[index] = 1;
  for (const index of CAMPS[1]) pieces[index] = 2;
  return {
    version: 1,
    gameId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
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
    const hole = HOLES[current];
    for (const [dx, dy] of STEP_DIRECTIONS) {
      const middle = indexAt(hole.x + dx, hole.y + dy);
      const landing = indexAt(hole.x + dx * 2, hole.y + dy * 2);
      if (middle < 0 || landing < 0 || state.pieces[middle] === 0) continue;
      const landingOccupied = landing === fromIndex ? false : state.pieces[landing] !== 0;
      if (landingOccupied || visited.has(landing)) continue;
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

  for (const [dx, dy] of STEP_DIRECTIONS) {
    const destination = indexAt(from.x + dx, from.y + dy);
    if (destination >= 0 && state.pieces[destination] === 0) results.add(destination);
  }

  for (const destination of jumpDestinations(state, fromIndex)) results.add(destination);

  const targetCamp = CAMPS[player === 0 ? 1 : 0];
  if (targetCamp.has(fromIndex)) {
    return [...results].filter((destination) => targetCamp.has(destination));
  }

  return [...results];
}

function isWinningPosition(state, player) {
  const targetCamp = CAMPS[player === 0 ? 1 : 0];
  let count = 0;
  for (const index of targetCamp) {
    if (state.pieces[index] === player + 1) count += 1;
  }
  return count === 10;
}

function applyMove(state, from, to) {
  if (state.phase !== 'playing') return { ok: false, message: 'Игра уже завершена.' };
  if (state.pieces[from] !== state.currentPlayer + 1) {
    return { ok: false, message: 'Сейчас ход другого игрока.' };
  }
  const legal = getLegalDestinations(state, from);
  if (!legal.includes(to)) return { ok: false, message: 'Так ходить нельзя.' };

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
    for (const to of getLegalDestinations(state, from, { ignoreTurn: true })) {
      moves.push({ from, to });
    }
  }
  return moves;
}

function progressScore(player, from, to) {
  const a = HOLES[from];
  const b = HOLES[to];
  const direction = player === 0 ? 1 : -1;
  const forward = (b.y - a.y) * direction;
  const centerBias = Math.abs(a.x - 12) - Math.abs(b.x - 12);
  const targetCamp = CAMPS[player === 0 ? 1 : 0];
  const homeCamp = CAMPS[player];
  const targetBonus = targetCamp.has(to) ? 35 : 0;
  const leaveHomeBonus = homeCamp.has(from) && !homeCamp.has(to) ? 12 : 0;
  const longJumpBonus = Math.max(0, Math.abs(b.y - a.y) + Math.abs(b.x - a.x) / 2 - 1) * 1.5;
  return forward * 12 + centerBias * 1.5 + targetBonus + leaveHomeBonus + longJumpBonus;
}

function chooseBotMove(state, difficulty = 'smart') {
  const moves = getAllLegalMoves(state, state.currentPlayer);
  if (!moves.length) return null;
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];

  const player = state.currentPlayer;
  const scored = moves.map((move) => {
    let score = progressScore(player, move.from, move.to);
    if (difficulty === 'smart') {
      const simulated = cloneState(state);
      applyMove(simulated, move.from, move.to);
      if (simulated.winner === player) score += 10000;
      score += Math.random() * 5;
    }
    return { ...move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, Math.min(difficulty === 'smart' ? 4 : 8, scored.length));
  return pool[Math.floor(Math.random() * pool.length)];
}
