import { createServer } from "node:http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@corners/game-core";
import { RoomStore } from "./room-store";

const port = Number(process.env.PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const roomStore = new RoomStore();

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ message: "Not found" }));
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: webOrigin,
  },
});

io.on("connection", (socket) => {
  socket.on("room:create", (acknowledge) => {
    const room = roomStore.createRoom(socket.id);
    socket.join(room.code);
    acknowledge({ ok: true, roomCode: room.code });
    io.to(room.code).emit("room:state", room);
  });

  socket.on("room:join", ({ roomCode }, acknowledge) => {
    const result = roomStore.joinRoom(roomCode, socket.id);

    if (!result.ok) {
      acknowledge(result);
      return;
    }

    socket.join(result.room.code);
    acknowledge({ ok: true, roomCode: result.room.code });
    io.to(result.room.code).emit("room:state", result.room);
  });
});

httpServer.listen(port, () => {
  console.log(`Corners multiplayer server listening on http://localhost:${port}`);
});
