#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/tools"
cat > "$ROOT/tools/bridge-mock-test.mjs" <<'__AD_CURRENT_BRIDGE_TEST__'
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const bridge = fs.readFileSync(path.join(root, "app/src/main/assets/native/native-bridge.js"), "utf8");
const storage = new Map();
const calls = {
  buyTick: 0,
  buyMaxTick: 0,
  dimBoost: 0,
  galaxy: 0,
  infinity: 0,
  eternity: 0,
  upgrade: 0,
  save: 0,
  import: 0,
  legacyToggle: 0,
};
const dimensionData = Array.from({ length: 8 }, (_, index) => ({
  tier: index + 1,
  totalAmount: 0,
  bought: 0,
  multiplier: 1,
  productionPerSecond: 0,
  costUntil10: 10 ** (index + 1),
  isAvailableForPurchase: index === 0,
  isAffordableUntil10: index === 0,
  remainingUntil10: 1,
  amount: { toNumber: () => 0 },
}));

const dimBoost = { canBeBought: true, requirement: { isSatisfied: true, amount: 20, tier: 4 } };
const galaxy = { canBeBought: true, requirement: { isSatisfied: true, amount: 80, tier: 8 } };
const playerApi = { canCrunch: true, canEternity: true, anyChallenge: null };
let canSave = true;
let lastImported = null;

Object.assign(globalThis, {
  window: globalThis,
  document: {
    documentElement: {
      classList: {
        add() {},
        toggle() { calls.legacyToggle += 1; },
      },
    },
  },
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  format: value => String(value?.value ?? value ?? 0),
  formatInt: value => String(value ?? 0),
  player: { dimensionBoosts: 0, galaxies: 0 },
  Currency: {
    antimatter: { value: 10, productionPerSecond: 0 },
    infinityPoints: { value: 0 }, eternityPoints: { value: 0 }, realityMachines: { value: 0 },
    infinities: { value: 0 }, eternities: { value: 0 }, realities: { value: 0 },
  },
  AntimatterDimension: tier => dimensionData[tier - 1],
  Laitela: { continuumActive: false, isUnlocked: false },
  Teresa: { isUnlocked: false }, Effarig: { isUnlocked: false }, Enslaved: { isUnlocked: false },
  V: { isUnlocked: false }, Ra: { isUnlocked: false },
  PlayerProgress: { infinityUnlocked: () => true, eternityUnlocked: () => true, realityUnlocked: () => false },
  Player: playerApi,
  DimBoost: dimBoost,
  Galaxy: galaxy,
  Tickspeed: { cost: 1000, isAvailableForPurchase: true, isAffordable: true },
  MachineHandler: { gainedRealityMachines: 0 },
  isRealityAvailable: () => false,
  gainedInfinityPoints: () => 12,
  gainedEternityPoints: () => 3,
  Achievements: { effectiveCount: 0, all: [] },
  InfinityUpgrade: {
    totalTimeMult: {
      config: { description: "Time multiplier" },
      cost: 1,
      purchaseCount: 0,
      isAvailableForPurchase: true,
      canBeBought: true,
      isBought: false,
      purchase() { calls.upgrade += 1; this.isBought = true; return true; },
    },
  },
  GameStorage: {
    lastSaveTime: Date.now(),
    currentSlot: 0,
    canSave: () => canSave,
    save() { calls.save += 1; },
    exportModifiedSave: () => "valid-baseline-save",
    checkPlayerObject: value => value?.valid ? "" : "invalid save",
    import(encoded) { calls.import += 1; lastImported = encoded; },
  },
  GameSaveSerializer: { deserialize: encoded => ({ valid: encoded.startsWith("valid") }) },
  GameUI: { update() {} },
  buyManyDimension: tier => { dimensionData[tier - 1].bought += 1; return true; },
  buyMaxDimension: tier => { dimensionData[tier - 1].bought += 10; return true; },
  buyTickSpeed: () => { calls.buyTick += 1; return true; },
  buyMaxTickSpeed: () => { calls.buyMaxTick += 1; return true; },
  requestDimensionBoost: () => { calls.dimBoost += 1; },
  requestGalaxyReset: () => { calls.galaxy += 1; return true; },
  bigCrunchResetRequest: () => { calls.infinity += 1; },
  eternity: () => { calls.eternity += 1; },
});

const result = value => JSON.parse(value);
const command = (name, payload = {}) => result(window.ADMobileNative.command(name, JSON.stringify(payload)));

vm.runInThisContext(bridge, { filename: "native-bridge.js" });

const initial = result(window.ADMobileNative.snapshot());
if (!initial.ready || initial.dimensions.length !== 8) throw new Error("Snapshot mock contract failed");
if (initial.resets.filter(item => item.available).length < 4) throw new Error("Progression availability snapshot failed");

const purchase = command("buyDimension", { tier: 1 });
if (!purchase.ok || dimensionData[0].bought !== 1) throw new Error("Purchase command mock failed");
const buyMax = command("buyMaxDimension", { tier: 1 });
if (!buyMax.ok || dimensionData[0].bought !== 11) throw new Error("Buy-max command mock failed");
dimensionData[0].isAffordableUntil10 = false;
const unavailable = command("buyDimension", { tier: 1 });
if (unavailable.ok || unavailable.event !== "INVALID_ACTION") throw new Error("Unavailable purchase was not rejected");

if (!command("buyTickspeed").ok || calls.buyTick !== 1) throw new Error("Tickspeed command failed");
if (!command("buyTickspeed", { max: true }).ok || calls.buyMaxTick !== 1) throw new Error("Max tickspeed command failed");
if (!command("dimensionBoost", { bulk: true }).ok || calls.dimBoost !== 1) throw new Error("Dimension Boost command failed");
if (!command("galaxy", { bulk: true }).ok || calls.galaxy !== 1) throw new Error("Galaxy command failed");
if (!command("infinity").ok || calls.infinity !== 1) throw new Error("Infinity command failed");
if (!command("eternity").ok || calls.eternity !== 1) throw new Error("Eternity command failed");
if (!command("purchaseUpgrade", { id: "totalTimeMult" }).ok || calls.upgrade !== 1) throw new Error("Upgrade command failed");
if (!command("setLegacyMode", { visible: true }).ok || calls.legacyToggle !== 1) throw new Error("Compatibility visibility command failed");

const manualSave = command("save");
if (!manualSave.ok || calls.save !== 1) throw new Error("Manual save command failed");
canSave = false;
const blockedSave = command("save");
if (blockedSave.ok || blockedSave.event !== "INVALID_ACTION") throw new Error("Unsafe save was not rejected");
if (window.ADMobileNative.exportSave() !== "") throw new Error("Export was allowed while saving was unavailable");
canSave = true;

const exported = window.ADMobileNative.exportSave();
if (exported !== "valid-baseline-save" || calls.save !== 2) throw new Error("Save export contract failed");
const validImport = result(window.ADMobileNative.importSave("valid-import"));
if (!validImport.ok || !storage.has("ADNativeRecoverySave") || lastImported !== "valid-import") {
  throw new Error("Valid import/recovery mock failed");
}
const invalidImport = result(window.ADMobileNative.importSave("broken"));
if (invalidImport.ok || calls.import !== 1) throw new Error("Invalid import was accepted");
const restored = command("restoreRecovery");
if (!restored.ok || lastImported !== "valid-baseline-save" || calls.import !== 2) {
  throw new Error("Recovery restore command failed");
}

console.log("Native bridge mock test passed.");
__AD_CURRENT_BRIDGE_TEST__
