#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/tools"
cat > "$ROOT/tools/verify-project.mjs" <<'__AD_FILE_13_0__'
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const required = [
  "app/src/main/assets/game/index.html",
  "app/src/main/assets/native/native-bridge.js",
  "app/src/main/java/com/vitautas/antimatter/nativegame/MainActivity.kt",
  "engine/web/src/main/java/com/vitautas/antimatter/engine/web/WebGameEngine.kt",
  "core/model/src/main/java/com/vitautas/antimatter/core/model/GameModels.kt",
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing required file: ${relative}`);
}

const bridge = fs.readFileSync(path.join(root, "app/src/main/assets/native/native-bridge.js"), "utf8");
for (const command of [
  "buyDimension", "buyMaxDimension", "buyTickspeed", "dimensionBoost", "galaxy",
  "infinity", "eternity", "purchaseUpgrade", "save", "restoreRecovery", "setLegacyMode"
]) {
  if (!bridge.includes(`case "${command}"`)) throw new Error(`Bridge command missing: ${command}`);
}
for (const contract of ["GameSaveSerializer.deserialize", "GameStorage.checkPlayerObject", "exportModifiedSave"]) {
  if (!bridge.includes(contract)) throw new Error(`Save compatibility contract missing: ${contract}`);
}
if (/querySelector\([^)]*(buy|max|dimension|infinity)/i.test(bridge)) {
  throw new Error("Bridge must call game APIs, not scrape purchase controls from the DOM");
}

const index = fs.readFileSync(path.join(root, "app/src/main/assets/game/index.html"), "utf8");
if (!index.includes("js/app.")) throw new Error("Built upstream game entrypoint is missing");

console.log("Project contract verification passed.");

__AD_FILE_13_0__
