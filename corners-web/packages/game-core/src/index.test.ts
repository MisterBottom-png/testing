import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./index";

describe("createInitialGameState", () => {
  it("creates a waiting two-player opposite-triangle game", () => {
    expect(createInitialGameState()).toEqual({
      phase: "waiting",
      boardVariant: "opposite-triangles",
      currentPlayerIndex: 0,
      winnerPlayerIndex: null,
    });
  });
});
