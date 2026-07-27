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
  it("builds all three homes in the reference diagonal", () => {
    expect(BOARD_CELLS).toHaveLength(64);
    expect(getPieceCount("3x3")).toBe(9);
    expect(getPieceCount("3x4")).toBe(12);
    expect(getPieceCount("1-2-3-4")).toBe(10);

    for (const homeType of ["3x3", "3x4", "1-2-3-4"] as const) {
      const [firstHome, secondHome] = getCamps(homeType);
      expect(firstHome.has(indexAt(0, 7))).toBe(true);
      expect(firstHome.has(indexAt(0, 0))).toBe(false);
      expect(secondHome.has(indexAt(7, 0))).toBe(true);
      expect(secondHome.has(indexAt(7, 7))).toBe(false);
    }
  });

  it("mirrors the triangular homes between bottom-left and top-right", () => {
    const [firstHome, secondHome] = getCamps("1-2-3-4");
    const firstCoordinates = [
      [0, 4],
      [0, 5], [1, 5],
      [0, 6], [1, 6], [2, 6],
      [0, 7], [1, 7], [2, 7], [3, 7],
    ];
    const secondCoordinates = [
      [4, 0], [5, 0], [6, 0], [7, 0],
      [5, 1], [6, 1], [7, 1],
      [6, 2], [7, 2],
      [7, 3],
    ];
    for (const [x, y] of firstCoordinates) expect(firstHome.has(indexAt(x, y))).toBe(true);
    for (const [x, y] of secondCoordinates) expect(secondHome.has(indexAt(x, y))).toBe(true);
  });

  it("fills the selected home", () => {
    const state = createInitialGameState("3x4", "diagonal");
    expect(state.homeType).toBe("3x4");
    expect(state.movementType).toBe("diagonal");
    expect(state.pieces.filter((piece) => piece === 1)).toHaveLength(12);
    expect(state.pieces.filter((piece) => piece === 2)).toHaveLength(12);
    expect(state.pieces[indexAt(0, 7)]).toBe(1);
    expect(state.pieces[indexAt(7, 0)]).toBe(2);
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
