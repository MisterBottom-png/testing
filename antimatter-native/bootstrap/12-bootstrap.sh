#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/engine/web/src/test/java/com/vitautas/antimatter/engine/web"
cat > "$ROOT/engine/web/src/test/java/com/vitautas/antimatter/engine/web/GameSnapshotJsonParserTest.kt" <<'__AD_FILE_12_0__'
package com.vitautas.antimatter.engine.web

import com.vitautas.antimatter.core.model.ProgressLayer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GameSnapshotJsonParserTest {
    @Test
    fun parsesAndClampsNativeSnapshot() {
        val snapshot = GameSnapshotJsonParser.parse(
            """
            {
              "ready": true,
              "bridgeVersion": 1,
              "timestampMs": 42,
              "layer": "INFINITY",
              "antimatter": "1e308",
              "dimensions": [{
                "tier": 1,
                "name": "First Dimension",
                "amount": "10",
                "bought": 10,
                "multiplier": "2",
                "productionPerSecond": "4",
                "cost": "100",
                "unlocked": true,
                "affordable": false,
                "buyMode": "Buy 10"
              }],
              "milestones": [{
                "id": "infinity",
                "title": "Break the finite",
                "description": "Reach Infinity",
                "reached": false,
                "progress": 3.5
              }]
            }
            """.trimIndent(),
        )

        assertTrue(snapshot.ready)
        assertEquals(ProgressLayer.INFINITY, snapshot.layer)
        assertEquals(1, snapshot.dimensions.single().tier)
        assertEquals(1f, snapshot.milestones.single().progress)
    }
}

__AD_FILE_12_0__

mkdir -p "$ROOT/engine/web/src/test/java/com/vitautas/antimatter/engine/web"
cat > "$ROOT/engine/web/src/test/java/com/vitautas/antimatter/engine/web/JavaScriptResultsTest.kt" <<'__AD_FILE_12_1__'
package com.vitautas.antimatter.engine.web

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class JavaScriptResultsTest {
    @Test
    fun decodesQuotedJavaScriptResult() {
        assertEquals("{\"ready\":true}", decodeJavaScriptString("\"{\\\"ready\\\":true}\""))
    }

    @Test
    fun nullResultRemainsNull() {
        assertNull(decodeJavaScriptString("null"))
    }
}

__AD_FILE_12_1__

mkdir -p "$ROOT/."
cat > "$ROOT/gradle.properties" <<'__AD_FILE_12_2__'
org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
org.gradle.configuration-cache=true
org.gradle.caching=true

__AD_FILE_12_2__

mkdir -p "$ROOT/."
cat > "$ROOT/settings.gradle.kts" <<'__AD_FILE_12_3__'
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "AntimatterDimensionsNative"
include(":app")
include(":core:model")
include(":engine:web")

__AD_FILE_12_3__

mkdir -p "$ROOT/tools"
cat > "$ROOT/tools/bridge-mock-test.mjs" <<'__AD_FILE_12_4__'
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const bridge = fs.readFileSync(path.join(root, "app/src/main/assets/native/native-bridge.js"), "utf8");
const storage = new Map();
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

Object.assign(globalThis, {
  window: globalThis,
  document: { documentElement: { classList: { add() {}, toggle() {} } } },
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
  PlayerProgress: { infinityUnlocked: () => false, eternityUnlocked: () => false, realityUnlocked: () => false },
  Player: { canCrunch: false, canEternity: false, anyChallenge: null },
  DimBoost: { canBeBought: false, requirement: { isSatisfied: false, amount: 20, tier: 4 } },
  Galaxy: { canBeBought: false, requirement: { isSatisfied: false, amount: 80, tier: 8 } },
  Tickspeed: { cost: 1000, isAvailableForPurchase: true, isAffordable: false },
  MachineHandler: { gainedRealityMachines: 0 },
  isRealityAvailable: () => false,
  gainedInfinityPoints: () => 0,
  gainedEternityPoints: () => 0,
  Achievements: { effectiveCount: 0, all: [] },
  InfinityUpgrade: {},
  GameStorage: {
    lastSaveTime: Date.now(), currentSlot: 0,
    save() {}, exportModifiedSave: () => "valid-baseline-save",
    checkPlayerObject: value => value?.valid ? "" : "invalid save",
    import() {},
  },
  GameSaveSerializer: { deserialize: encoded => ({ valid: encoded.startsWith("valid") }) },
  GameUI: { update() {} },
  buyManyDimension: tier => { dimensionData[tier - 1].bought += 1; return true; },
  buyMaxDimension: tier => { dimensionData[tier - 1].bought += 10; return true; },
  buyTickSpeed: () => true,
  buyMaxTickSpeed: () => true,
  requestDimensionBoost() {}, requestGalaxyReset: () => false,
  bigCrunchResetRequest() {}, eternity() {},
});

vm.runInThisContext(bridge, { filename: "native-bridge.js" });
const initial = JSON.parse(window.ADMobileNative.snapshot());
if (!initial.ready || initial.dimensions.length !== 8) throw new Error("Snapshot mock contract failed");
const purchase = JSON.parse(window.ADMobileNative.command("buyDimension", JSON.stringify({ tier: 1 })));
if (!purchase.ok || dimensionData[0].bought !== 1) throw new Error("Purchase command mock failed");
const validImport = JSON.parse(window.ADMobileNative.importSave("valid-import"));
if (!validImport.ok || !storage.has("ADNativeRecoverySave")) throw new Error("Valid import/recovery mock failed");
const invalidImport = JSON.parse(window.ADMobileNative.importSave("broken"));
if (invalidImport.ok) throw new Error("Invalid import was accepted");
console.log("Native bridge mock test passed.");

__AD_FILE_12_4__

mkdir -p "$ROOT/tools"
cat > "$ROOT/tools/generate_audio.py" <<'__AD_FILE_12_5__'
#!/usr/bin/env python3
"""Generate small placeholder WAV assets used by the native alpha.

The files are intentionally synthetic and replaceable. They keep CI and local builds
self-contained without committing binary audio generated during development.
"""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

RATE = 22_050
OUT = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res" / "raw"
OUT.mkdir(parents=True, exist_ok=True)


def write_tone(name: str, seconds: float, frequencies: tuple[float, ...], volume: float = 0.18, fade: float = 0.04) -> None:
    frames = max(1, int(RATE * seconds))
    path = OUT / name
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        data = bytearray()
        for index in range(frames):
            t = index / RATE
            envelope = 1.0
            fade_frames = max(1, int(RATE * fade))
            if index < fade_frames:
                envelope *= index / fade_frames
            if frames - index < fade_frames:
                envelope *= max(0.0, (frames - index) / fade_frames)
            sample = sum(math.sin(2 * math.pi * f * t) for f in frequencies) / len(frequencies)
            data.extend(struct.pack("<h", int(32767 * volume * envelope * sample)))
        wav.writeframes(data)


for filename, frequencies in {
    "ambient_antimatter.wav": (55.0, 82.41, 110.0),
    "ambient_infinity.wav": (65.41, 98.0, 130.81),
    "ambient_eternity.wav": (73.42, 110.0, 146.83),
    "ambient_reality.wav": (87.31, 130.81, 174.61),
}.items():
    write_tone(filename, 3.0, frequencies, volume=0.055, fade=0.25)

write_tone("sfx_tap.wav", 0.07, (720.0,), volume=0.12, fade=0.015)
write_tone("sfx_purchase.wav", 0.12, (440.0, 660.0), volume=0.16, fade=0.02)
write_tone("sfx_invalid.wav", 0.16, (135.0, 155.0), volume=0.18, fade=0.025)
write_tone("sfx_achievement.wav", 0.65, (523.25, 659.25, 783.99), volume=0.14, fade=0.06)
write_tone("sfx_prestige.wav", 1.20, (130.81, 261.63, 392.0), volume=0.16, fade=0.12)
print(f"Generated placeholder audio in {OUT}")

__AD_FILE_12_5__

mkdir -p "$ROOT/tools/upstream-build"
cat > "$ROOT/tools/upstream-build/post-build.js" <<'__AD_FILE_12_6__'
const fs = require("fs");
const path = require("path");
const commit = {
  sha: process.env.AD_UPSTREAM_COMMIT || "8ae221fcb07db667b3d04114c2b977175966611d",
  message: "Pinned source package build",
  author: "IvarK/AntimatterDimensionsSourceCode"
};
fs.writeFileSync(path.resolve(__dirname, "../dist/commit.json"), JSON.stringify(commit));

__AD_FILE_12_6__

mkdir -p "$ROOT/tools/upstream-build"
cat > "$ROOT/tools/upstream-build/pre-build.js" <<'__AD_FILE_12_7__'
const fs = require("fs");
const path = require("path");
const browserslist = require("browserslist-useragent-regexp");
const userAgentRegExp = browserslist.getUserAgentRegExp({ allowHigherVersions: true });
const checkFunction = `export const supportedBrowsers = ${userAgentRegExp};`;
fs.writeFileSync(path.resolve(__dirname, "../src/supported-browsers.js"), checkFunction);
const firebaseConfig = process.env.FIREBASE_CONFIG;
if (firebaseConfig) {
  fs.writeFileSync(
    path.resolve(__dirname, "../src/core/storage/firebase-config.js"),
    `export const firebaseConfig = ${firebaseConfig};`
  );
}

__AD_FILE_12_7__
