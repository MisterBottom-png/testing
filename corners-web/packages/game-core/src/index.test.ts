import { describe, expect, it } from "vitest";
import {
  BOARD_CELLS,
  createInitialGameState,
  getCamps,
  getLegalDestinations,
  getPieceCount,
  indexAt,
} from "./index";

describe("corners conventions", () => {
  it("builds all three homes", () => {
    expect(BOARD_CELLS).toHaveLength(64);
    expect(getPieceCount("3x3")).toBe(9);
    expect(getPieceCount("3x4")).toBe(12);
    expect(getPieceCount("1-2-3-4")).toBe(10);
    expect(getCamps("1-2-3-4")[0].has(indexAt(0, 3))).toBe(true);
    expect(getCamps("1-2-3-4")[0].has(indexAt(3, 1))).toBe(false);
  });

  it("fills the selected home", () => {
    const state = createInitialGameState("3x4", "diagonal");
    expect(state.homeType).toBe("3x4");
    expect(state.movementType).toBe("diagonal");
    expect(state.pieces.filter((piece) => piece === 1)).toHaveLength(12);
    expect(state.pieces.filter((piece) => piece === 2)).toHaveLength(12);
  });

  it("keeps classic moves orthogonal", () => {
    const state = createInitialGameState("3x3", "classic");
    state.pieces.fill(0);
    state.pieces[indexAt(3, 3)] = 1;
    const legal = getLegalDestinations(state, indexAt(3, 3));
    expect(legal).toContain(indexAt(4, 3));
    expect(legal).not.toContain(indexAt(4, 4));
  });

  it("allows diagonal steps and jumps in diagonal games", () => {
    const state = createInitialGameState("3x3", "diagonal");
    state.pieces.fill(0);
    state.pieces[indexAt(2, 2)] = 1;
    expect(getLegalDestinations(state, indexAt(2, 2))).toContain(indexAt(3, 3));
    state.pieces[indexAt(3, 3)] = 2;
    expect(getLegalDestinations(state, indexAt(2, 2))).toContain(indexAt(4, 4));
  });
});
