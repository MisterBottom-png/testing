#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/core/model/src/main/java/com/vitautas/antimatter/core/model"
cat > "$ROOT/core/model/src/main/java/com/vitautas/antimatter/core/model/GameModels.kt" <<'__AD_FILE_9_0__'
package com.vitautas.antimatter.core.model

enum class ProgressLayer(val displayName: String) {
    ANTIMATTER("Antimatter"),
    INFINITY("Infinity"),
    ETERNITY("Eternity"),
    REALITY("Reality"),
    CELESTIALS("Celestials");

    companion object {
        fun fromWire(value: String?): ProgressLayer = entries.firstOrNull {
            it.name.equals(value, ignoreCase = true)
        } ?: ANTIMATTER
    }
}

enum class GraphicsQuality { LOW, BALANCED, HIGH }

data class GameSettings(
    val musicEnabled: Boolean = true,
    val musicVolume: Float = 0.45f,
    val soundEnabled: Boolean = true,
    val soundVolume: Float = 0.70f,
    val hapticsEnabled: Boolean = true,
    val reducedMotion: Boolean = false,
    val reducedEffects: Boolean = false,
    val graphicsQuality: GraphicsQuality = GraphicsQuality.BALANCED,
)

data class DimensionState(
    val tier: Int,
    val name: String,
    val amount: String,
    val bought: Long,
    val multiplier: String,
    val productionPerSecond: String,
    val cost: String,
    val unlocked: Boolean,
    val affordable: Boolean,
    val buyMode: String,
)

data class ResetActionState(
    val id: String,
    val title: String,
    val subtitle: String,
    val reward: String,
    val unlocked: Boolean,
    val available: Boolean,
    val destructive: Boolean = true,
)

data class UpgradeState(
    val id: String,
    val title: String,
    val description: String,
    val cost: String,
    val level: String,
    val unlocked: Boolean,
    val affordable: Boolean,
    val purchased: Boolean,
)

data class AchievementState(
    val id: Int,
    val name: String,
    val description: String,
    val unlocked: Boolean,
)

data class MilestoneState(
    val id: String,
    val title: String,
    val description: String,
    val reached: Boolean,
    val progress: Float,
)

data class GameSnapshot(
    val ready: Boolean = false,
    val bridgeVersion: Int = 0,
    val timestampMs: Long = 0,
    val layer: ProgressLayer = ProgressLayer.ANTIMATTER,
    val antimatter: String = "10",
    val antimatterPerSecond: String = "0",
    val infinityPoints: String = "0",
    val eternityPoints: String = "0",
    val realityMachines: String = "0",
    val infinities: String = "0",
    val eternities: String = "0",
    val realities: String = "0",
    val dimensions: List<DimensionState> = emptyList(),
    val resets: List<ResetActionState> = emptyList(),
    val upgrades: List<UpgradeState> = emptyList(),
    val achievements: List<AchievementState> = emptyList(),
    val achievementUnlockedCount: Int = 0,
    val achievementTotalCount: Int = 0,
    val milestones: List<MilestoneState> = emptyList(),
    val dimensionBoosts: Long = 0,
    val galaxies: Long = 0,
    val tickspeedCost: String = "1,000",
    val tickspeedAffordable: Boolean = false,
    val challengeName: String? = null,
    val autosaveSeconds: Int = 0,
    val currentSaveSlot: Int = 0,
    val recoverySaveAvailable: Boolean = false,
    val error: String? = null,
) {
    companion object {
        val Loading = GameSnapshot()
    }
}

data class EngineEvent(
    val type: Type,
    val significance: Significance = Significance.LIGHT,
    val message: String? = null,
) {
    enum class Type {
        PURCHASE,
        INVALID_ACTION,
        ACHIEVEMENT,
        MILESTONE,
        PRESTIGE,
        NAVIGATION,
        SAVE,
        IMPORT,
        ERROR,
    }

    enum class Significance { LIGHT, MEDIUM, HEAVY }
}

data class EngineStatus(
    val state: State = State.STARTING,
    val detail: String? = null,
) {
    enum class State { STARTING, LOADING, READY, ERROR, DESTROYED }
}

object GameEventDetector {
    fun between(previous: GameSnapshot, current: GameSnapshot): List<EngineEvent> {
        if (!previous.ready || !current.ready) return emptyList()
        return buildList {
            if (current.achievementUnlockedCount > previous.achievementUnlockedCount) {
                add(
                    EngineEvent(
                        type = EngineEvent.Type.ACHIEVEMENT,
                        significance = EngineEvent.Significance.MEDIUM,
                        message = "Achievement unlocked",
                    ),
                )
            }
            if (current.layer.ordinal > previous.layer.ordinal) {
                add(
                    EngineEvent(
                        type = EngineEvent.Type.MILESTONE,
                        significance = EngineEvent.Significance.HEAVY,
                        message = "${current.layer.displayName} unlocked",
                    ),
                )
            }
        }
    }
}

__AD_FILE_9_0__

mkdir -p "$ROOT/core/model/src/test/java/com/vitautas/antimatter/core/model"
cat > "$ROOT/core/model/src/test/java/com/vitautas/antimatter/core/model/GameModelsTest.kt" <<'__AD_FILE_9_1__'
package com.vitautas.antimatter.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GameModelsTest {
    @Test
    fun unknownLayerFallsBackToAntimatter() {
        assertEquals(ProgressLayer.ANTIMATTER, ProgressLayer.fromWire("something-new"))
    }

    @Test
    fun wireLayerParsingIsCaseInsensitive() {
        assertEquals(ProgressLayer.REALITY, ProgressLayer.fromWire("reality"))
    }
    @Test
    fun detectsAchievementAndLayerTransitionsOnlyAfterReadyState() {
        val loadingEvents = GameEventDetector.between(
            GameSnapshot.Loading,
            GameSnapshot(ready = true, layer = ProgressLayer.INFINITY, achievementUnlockedCount = 1),
        )
        assertTrue(loadingEvents.isEmpty())

        val events = GameEventDetector.between(
            GameSnapshot(ready = true, layer = ProgressLayer.ANTIMATTER, achievementUnlockedCount = 2),
            GameSnapshot(ready = true, layer = ProgressLayer.INFINITY, achievementUnlockedCount = 3),
        )
        assertEquals(listOf(EngineEvent.Type.ACHIEVEMENT, EngineEvent.Type.MILESTONE), events.map { it.type })
        assertEquals(EngineEvent.Significance.HEAVY, events.last().significance)
    }

}

__AD_FILE_9_1__

mkdir -p "$ROOT/engine/web"
cat > "$ROOT/engine/web/build.gradle.kts" <<'__AD_FILE_9_2__'
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.vitautas.antimatter.engine.web"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    api(project(":core:model"))
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation(kotlin("test"))
    testImplementation("org.json:json:20240303")
}

__AD_FILE_9_2__

mkdir -p "$ROOT/engine/web/src/main"
cat > "$ROOT/engine/web/src/main/AndroidManifest.xml" <<'__AD_FILE_9_3__'
<manifest />

__AD_FILE_9_3__
