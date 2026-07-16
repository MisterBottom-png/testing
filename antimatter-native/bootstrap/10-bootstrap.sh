#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/engine/web/src/main/java/com/vitautas/antimatter/engine/web"
cat > "$ROOT/engine/web/src/main/java/com/vitautas/antimatter/engine/web/GameSnapshotJsonParser.kt" <<'__AD_FILE_10_0__'
package com.vitautas.antimatter.engine.web

import com.vitautas.antimatter.core.model.AchievementState
import com.vitautas.antimatter.core.model.DimensionState
import com.vitautas.antimatter.core.model.GameSnapshot
import com.vitautas.antimatter.core.model.MilestoneState
import com.vitautas.antimatter.core.model.ProgressLayer
import com.vitautas.antimatter.core.model.ResetActionState
import com.vitautas.antimatter.core.model.UpgradeState
import org.json.JSONArray
import org.json.JSONObject

internal object GameSnapshotJsonParser {
    fun parse(json: String): GameSnapshot {
        val root = JSONObject(json)
        if (!root.optBoolean("ready", false)) {
            return GameSnapshot.Loading.copy(
                bridgeVersion = root.optInt("bridgeVersion", 0),
                timestampMs = root.optLong("timestampMs", 0),
            )
        }

        return GameSnapshot(
            ready = true,
            bridgeVersion = root.optInt("bridgeVersion", 0),
            timestampMs = root.optLong("timestampMs", 0),
            layer = ProgressLayer.fromWire(root.optString("layer")),
            antimatter = root.optString("antimatter", "0"),
            antimatterPerSecond = root.optString("antimatterPerSecond", "0"),
            infinityPoints = root.optString("infinityPoints", "0"),
            eternityPoints = root.optString("eternityPoints", "0"),
            realityMachines = root.optString("realityMachines", "0"),
            infinities = root.optString("infinities", "0"),
            eternities = root.optString("eternities", "0"),
            realities = root.optString("realities", "0"),
            dimensions = root.optJSONArray("dimensions").mapObjects(::parseDimension),
            resets = root.optJSONArray("resets").mapObjects(::parseReset),
            upgrades = root.optJSONArray("upgrades").mapObjects(::parseUpgrade),
            achievements = root.optJSONArray("achievements").mapObjects(::parseAchievement),
            achievementUnlockedCount = root.optInt("achievementUnlockedCount", 0),
            achievementTotalCount = root.optInt("achievementTotalCount", 0),
            milestones = root.optJSONArray("milestones").mapObjects(::parseMilestone),
            dimensionBoosts = root.optLong("dimensionBoosts", 0),
            galaxies = root.optLong("galaxies", 0),
            tickspeedCost = root.optString("tickspeedCost", "0"),
            tickspeedAffordable = root.optBoolean("tickspeedAffordable", false),
            challengeName = root.optNullableString("challengeName"),
            autosaveSeconds = root.optInt("autosaveSeconds", 0),
            currentSaveSlot = root.optInt("currentSaveSlot", 0),
            recoverySaveAvailable = root.optBoolean("recoverySaveAvailable", false),
            error = root.optNullableString("error"),
        )
    }

    private fun parseDimension(value: JSONObject) = DimensionState(
        tier = value.optInt("tier"),
        name = value.optString("name"),
        amount = value.optString("amount", "0"),
        bought = value.optLong("bought", 0),
        multiplier = value.optString("multiplier", "1×"),
        productionPerSecond = value.optString("productionPerSecond", "0/s"),
        cost = value.optString("cost", "—"),
        unlocked = value.optBoolean("unlocked", false),
        affordable = value.optBoolean("affordable", false),
        buyMode = value.optString("buyMode", "Buy"),
    )

    private fun parseReset(value: JSONObject) = ResetActionState(
        id = value.optString("id"),
        title = value.optString("title"),
        subtitle = value.optString("subtitle"),
        reward = value.optString("reward"),
        unlocked = value.optBoolean("unlocked", false),
        available = value.optBoolean("available", false),
        destructive = value.optBoolean("destructive", true),
    )

    private fun parseUpgrade(value: JSONObject) = UpgradeState(
        id = value.optString("id"),
        title = value.optString("title"),
        description = value.optString("description"),
        cost = value.optString("cost"),
        level = value.optString("level"),
        unlocked = value.optBoolean("unlocked", false),
        affordable = value.optBoolean("affordable", false),
        purchased = value.optBoolean("purchased", false),
    )

    private fun parseAchievement(value: JSONObject) = AchievementState(
        id = value.optInt("id"),
        name = value.optString("name"),
        description = value.optString("description"),
        unlocked = value.optBoolean("unlocked", false),
    )

    private fun parseMilestone(value: JSONObject) = MilestoneState(
        id = value.optString("id"),
        title = value.optString("title"),
        description = value.optString("description"),
        reached = value.optBoolean("reached", false),
        progress = value.optDouble("progress", 0.0).toFloat().coerceIn(0f, 1f),
    )

    private inline fun <T> JSONArray?.mapObjects(transform: (JSONObject) -> T): List<T> {
        if (this == null) return emptyList()
        return buildList(length()) {
            for (index in 0 until length()) {
                optJSONObject(index)?.let { add(transform(it)) }
            }
        }
    }

    private fun JSONObject.optNullableString(name: String): String? {
        if (!has(name) || isNull(name)) return null
        return optString(name).takeIf { it.isNotBlank() && it != "null" }
    }
}

__AD_FILE_10_0__

mkdir -p "$ROOT/engine/web/src/main/java/com/vitautas/antimatter/engine/web"
cat > "$ROOT/engine/web/src/main/java/com/vitautas/antimatter/engine/web/JavaScriptResults.kt" <<'__AD_FILE_10_1__'
package com.vitautas.antimatter.engine.web

import org.json.JSONTokener

internal fun decodeJavaScriptString(raw: String?): String? {
    if (raw == null || raw == "null" || raw == "undefined") return null
    return runCatching {
        when (val value = JSONTokener(raw).nextValue()) {
            is String -> value
            else -> value?.toString()
        }
    }.getOrElse { raw }
}

__AD_FILE_10_1__
