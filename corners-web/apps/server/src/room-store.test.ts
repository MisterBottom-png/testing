import { describe, expect, it } from "vitest";
import { RoomStore } from "./room-store";

describe("RoomStore", () => {
  it("creates a waiting room with a normalized code", () => {
    const store = new RoomStore(() => "ab12cd");

    const room = store.createRoom("host-1");

    expect(room).toEqual({
      code: "AB12CD",
      playerIds: ["host-1"],
      status: "waiting",
    });
  });

  it("activates a room when the second player joins", () => {
    const store = new RoomStore(() => "ROOM22");
    store.createRoom("host-1");

    const result = store.joinRoom("room22", "guest-1");

    expect(result).toEqual({
      ok: true,
      room: {
        code: "ROOM22",
        playerIds: ["host-1", "guest-1"],
        status: "active",
      },
    });
  });

  it("rejects a third player", () => {
    const store = new RoomStore(() => "FULL22");
    store.createRoom("host-1");
    store.joinRoom("FULL22", "guest-1");

    const result = store.joinRoom("FULL22", "guest-2");

    expect(result).toEqual({ ok: false, message: "Комната уже заполнена." });
  });
});
