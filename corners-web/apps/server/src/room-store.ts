import type { RoomState } from "@corners/game-core";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RoomStoreResult =
  | { ok: true; room: RoomState }
  | { ok: false; message: string };

export type RoomCodeFactory = () => string;

function defaultRoomCodeFactory(): string {
  return Array.from({ length: 6 }, () => {
    const index = Math.floor(Math.random() * ROOM_ALPHABET.length);
    return ROOM_ALPHABET[index] ?? "A";
  }).join("");
}

export class RoomStore {
  private readonly rooms = new Map<string, RoomState>();

  constructor(private readonly codeFactory: RoomCodeFactory = defaultRoomCodeFactory) {}

  createRoom(hostPlayerId: string): RoomState {
    let code = this.codeFactory().trim().toUpperCase();

    while (!code || this.rooms.has(code)) {
      code = this.codeFactory().trim().toUpperCase();
    }

    const room: RoomState = {
      code,
      playerIds: [hostPlayerId],
      status: "waiting",
    };

    this.rooms.set(code, room);
    return room;
  }

  joinRoom(rawCode: string, playerId: string): RoomStoreResult {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      return { ok: false, message: "Комната не найдена." };
    }

    if (room.playerIds.includes(playerId)) {
      return { ok: true, room };
    }

    if (room.playerIds.length >= 2) {
      return { ok: false, message: "Комната уже заполнена." };
    }

    const updatedRoom: RoomState = {
      ...room,
      playerIds: [...room.playerIds, playerId],
      status: "active",
    };

    this.rooms.set(code, updatedRoom);
    return { ok: true, room: updatedRoom };
  }
}
