import { io, type Socket } from "socket.io-client";
import type {
  RoomMutationResult,
  ServerToClientEvents,
  ClientToServerEvents,
} from "@corners/game-core";
import "./styles.css";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl);

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Application root #app was not found");
}

app.innerHTML = `
  <main class="app-shell">
    <header class="hero">
      <p class="eyebrow">Мультиплеерная веб-игра</p>
      <h1>Уголки Online</h1>
      <p class="subtitle">Переведи все фишки в противоположный угол раньше соперника.</p>
    </header>

    <section class="status-card" aria-live="polite">
      <span class="status-dot" data-status-dot></span>
      <span data-status>Подключение к серверу…</span>
    </section>

    <section class="room-card">
      <button class="primary-button" data-create-room type="button">Создать комнату</button>
      <div class="join-row">
        <label class="visually-hidden" for="room-code">Код комнаты</label>
        <input id="room-code" data-room-code maxlength="6" autocomplete="off" inputmode="text" placeholder="КОД" />
        <button class="secondary-button" data-join-room type="button">Войти</button>
      </div>
      <p class="room-message" data-room-message>Создай комнату или введи код приглашения.</p>
    </section>

    <section class="board-placeholder" aria-label="Игровое поле">
      <div class="camp camp-one" aria-hidden="true"></div>
      <div class="board-copy">
        <strong>Игровое поле</strong>
        <span>Появится после подключения второго игрока</span>
      </div>
      <div class="camp camp-two" aria-hidden="true"></div>
    </section>
  </main>
`;

const statusElement = document.querySelector<HTMLElement>("[data-status]");
const statusDot = document.querySelector<HTMLElement>("[data-status-dot]");
const messageElement = document.querySelector<HTMLElement>("[data-room-message]");
const roomCodeInput = document.querySelector<HTMLInputElement>("[data-room-code]");
const createButton = document.querySelector<HTMLButtonElement>("[data-create-room]");
const joinButton = document.querySelector<HTMLButtonElement>("[data-join-room]");

function setConnectionStatus(message: string, connected: boolean): void {
  if (statusElement) statusElement.textContent = message;
  statusDot?.classList.toggle("connected", connected);
}

function showRoomResult(result: RoomMutationResult): void {
  if (!messageElement) return;

  if (result.ok) {
    messageElement.textContent = `Комната ${result.roomCode}. Ожидаем соперника.`;
    if (roomCodeInput) roomCodeInput.value = result.roomCode;
    return;
  }

  messageElement.textContent = result.message;
}

socket.on("connect", () => setConnectionStatus("Сервер подключён", true));
socket.on("disconnect", () => setConnectionStatus("Связь потеряна. Переподключаемся…", false));
socket.on("room:state", (room) => {
  if (!messageElement) return;
  messageElement.textContent = room.status === "active"
    ? `Комната ${room.code}: соперник подключён.`
    : `Комната ${room.code}: ожидаем соперника.`;
});

createButton?.addEventListener("click", () => {
  socket.emit("room:create", showRoomResult);
});

joinButton?.addEventListener("click", () => {
  const roomCode = roomCodeInput?.value.trim().toUpperCase() ?? "";
  socket.emit("room:join", { roomCode }, showRoomResult);
});
