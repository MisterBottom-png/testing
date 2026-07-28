#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/app/src/main/assets/native"
cat > "$ROOT/app/src/main/assets/native/native-bridge.js" <<'__AD_FILE_1_0__'
(() => {
  "use strict";
  if (window.ADMobileNative) return;

  const BRIDGE_VERSION = 1;
  const DIMENSION_NAMES = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

  const safe = (fallback, block) => {
    try {
      const value = block();
      return value === undefined || value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  };

  const formatValue = value => safe("0", () => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return value > 0 ? "∞" : "0";
      if (Math.abs(value) < 1e6) return format(value, 2, 2);
    }
    return format(value, 2, 2);
  });

  const formatInteger = value => safe(String(value ?? 0), () => formatInt(value));
  const bool = block => Boolean(safe(false, block));
  const number = block => Number(safe(0, block)) || 0;

  const highestLayer = () => {
    if (bool(() => Teresa.isUnlocked || Effarig.isUnlocked || Enslaved.isUnlocked || V.isUnlocked || Ra.isUnlocked || Laitela.isUnlocked)) {
      return "CELESTIALS";
    }
    if (bool(() => PlayerProgress.realityUnlocked())) return "REALITY";
    if (bool(() => PlayerProgress.eternityUnlocked())) return "ETERNITY";
    if (bool(() => PlayerProgress.infinityUnlocked())) return "INFINITY";
    return "ANTIMATTER";
  };

  const dimension = tier => {
    const dim = safe(null, () => AntimatterDimension(tier));
    if (!dim) {
      return {
        tier,
        name: DIMENSION_NAMES[tier],
        amount: "0",
        bought: 0,
        multiplier: "1×",
        productionPerSecond: "0/s",
        cost: "—",
        unlocked: tier === 1,
        affordable: false,
        buyMode: "Buy 10"
      };
    }
    return {
      tier,
      name: `${DIMENSION_NAMES[tier]} Dimension`,
      amount: formatValue(dim.totalAmount),
      bought: number(() => dim.bought),
      multiplier: `${formatValue(dim.multiplier)}×`,
      productionPerSecond: `${formatValue(dim.productionPerSecond)}/s`,
      cost: formatValue(dim.costUntil10),
      unlocked: bool(() => dim.isAvailableForPurchase),
      affordable: bool(() => dim.isAffordableUntil10),
      buyMode: safe("Buy 10", () => Laitela.continuumActive ? "Continuum" : `Buy ${formatInteger(dim.remainingUntil10)}`)
    };
  };

  const resetActions = () => {
    const dimBoostReq = safe(null, () => DimBoost.requirement);
    const galaxyReq = safe(null, () => Galaxy.requirement);
    return [
      {
        id: "dimension_boost",
        title: "Dimension Boost",
        subtitle: dimBoostReq ? `Requires ${formatInteger(dimBoostReq.amount)} ${DIMENSION_NAMES[dimBoostReq.tier]} Dimensions` : "Unlock the next Dimension",
        reward: `Owned: ${formatInteger(number(() => player.dimensionBoosts))}`,
        unlocked: true,
        available: bool(() => DimBoost.canBeBought && DimBoost.requirement.isSatisfied),
        destructive: true
      },
      {
        id: "galaxy",
        title: "Antimatter Galaxy",
        subtitle: galaxyReq ? `Requires ${formatInteger(galaxyReq.amount)} ${DIMENSION_NAMES[galaxyReq.tier]} Dimensions` : "Improve tickspeed scaling",
        reward: `Owned: ${formatInteger(number(() => player.galaxies))}`,
        unlocked: bool(() => AntimatterDimension(8).isAvailableForPurchase || player.galaxies > 0),
        available: bool(() => Galaxy.canBeBought && Galaxy.requirement.isSatisfied),
        destructive: true
      },
      {
        id: "infinity",
        title: "Infinity",
        subtitle: "Collapse this Infinity and begin again",
        reward: `Gain ${formatValue(safe(0, () => gainedInfinityPoints()))} Infinity Points`,
        unlocked: bool(() => PlayerProgress.infinityUnlocked() || Player.canCrunch),
        available: bool(() => Player.canCrunch),
        destructive: true
      },
      {
        id: "eternity",
        title: "Eternity",
        subtitle: "Reset Infinity progress for a deeper layer",
        reward: `Gain ${formatValue(safe(0, () => gainedEternityPoints()))} Eternity Points`,
        unlocked: bool(() => PlayerProgress.eternityUnlocked() || Player.canEternity),
        available: bool(() => Player.canEternity),
        destructive: true
      },
      {
        id: "reality",
        title: "Reality",
        subtitle: "Choose a Glyph and reconstruct the universe",
        reward: `Gain ${formatValue(safe(0, () => MachineHandler.gainedRealityMachines))} Reality Machines`,
        unlocked: bool(() => PlayerProgress.realityUnlocked() || isRealityAvailable()),
        available: bool(() => isRealityAvailable()),
        destructive: true
      }
    ];
  };

  const upgradeList = () => {
    if (!bool(() => PlayerProgress.infinityUnlocked())) return [];
    const keys = [
      "totalTimeMult", "dim18mult", "dim27mult", "dim36mult", "dim45mult", "buy10Mult",
      "resetBoost", "galaxyBoost", "thisInfinityTimeMult", "unspentIPMult", "dimboostMult", "ipGen", "ipMult"
    ];
    return keys.map(key => safe(null, () => {
      const upgrade = InfinityUpgrade[key];
      if (!upgrade) return null;
      const config = upgrade.config || {};
      const title = typeof config.description === "function" ? config.description() : (config.description || key);
      const effect = typeof config.effect === "function" ? config.effect() : null;
      return {
        id: key,
        title: String(title).replace(/<[^>]+>/g, ""),
        description: effect ? `Current effect: ${formatValue(effect)}` : "Permanent Infinity upgrade",
        cost: formatValue(upgrade.cost),
        level: upgrade.purchaseCount !== undefined ? `Level ${formatInteger(upgrade.purchaseCount)}` : (upgrade.isBought ? "Purchased" : "Not purchased"),
        unlocked: bool(() => upgrade.isAvailableForPurchase !== false),
        affordable: bool(() => upgrade.canBeBought),
        purchased: bool(() => upgrade.isBought)
      };
    })).filter(Boolean);
  };

  const achievementList = () => safe([], () => {
    const unlocked = Achievements.all.filter(item => item.isUnlocked).slice(-16).reverse();
    const locked = Achievements.all.filter(item => !item.isUnlocked).slice(0, 24);
    return [...unlocked, ...locked].slice(0, 32).map(item => ({
      id: item.id,
      name: item.name,
      description: String(typeof item.config.description === "function" ? item.config.description() : (item.config.description || "Achievement")).replace(/<[^>]+>/g, ""),
      unlocked: item.isUnlocked
    }));
  });

  const milestoneList = () => {
    const antimatterLog = number(() => Currency.antimatter.value.log10());
    const infinityUnlocked = bool(() => PlayerProgress.infinityUnlocked());
    const eternityUnlocked = bool(() => PlayerProgress.eternityUnlocked());
    const realityUnlocked = bool(() => PlayerProgress.realityUnlocked());
    const celestialUnlocked = bool(() => Teresa.isUnlocked || Effarig.isUnlocked || Enslaved.isUnlocked || V.isUnlocked || Ra.isUnlocked || Laitela.isUnlocked);
    return [
      { id: "dim1", title: "First production", description: "Purchase your first Antimatter Dimension", reached: bool(() => AntimatterDimension(1).bought > 0), progress: bool(() => AntimatterDimension(1).bought > 0) ? 1 : 0 },
      { id: "boost", title: "Dimensional ascent", description: "Perform a Dimension Boost", reached: number(() => player.dimensionBoosts) > 0, progress: Math.min(1, number(() => AntimatterDimension(4).amount.toNumber()) / 20) },
      { id: "galaxy", title: "Galactic compression", description: "Create an Antimatter Galaxy", reached: number(() => player.galaxies) > 0, progress: Math.min(1, number(() => AntimatterDimension(8).amount.toNumber()) / 80) },
      { id: "infinity", title: "Break the finite", description: "Reach Infinity", reached: infinityUnlocked, progress: infinityUnlocked ? 1 : Math.max(0, Math.min(1, antimatterLog / 308)) },
      { id: "eternity", title: "Outlast Infinity", description: "Reach Eternity", reached: eternityUnlocked, progress: eternityUnlocked ? 1 : (infinityUnlocked ? 0.35 : 0) },
      { id: "reality", title: "Rewrite Reality", description: "Complete your first Reality", reached: realityUnlocked, progress: realityUnlocked ? 1 : (eternityUnlocked ? 0.25 : 0) },
      { id: "celestial", title: "Meet the Celestials", description: "Unlock the Celestial progression layer", reached: celestialUnlocked, progress: celestialUnlocked ? 1 : (realityUnlocked ? 0.15 : 0) }
    ];
  };

  const currentChallenge = () => safe(null, () => {
    const challenge = Player.anyChallenge;
    return challenge ? challenge.config.name : null;
  });

  const snapshot = () => {
    if (!window.player || !window.GameStorage || !window.Currency || !window.AntimatterDimension) {
      return JSON.stringify({ ready: false, bridgeVersion: BRIDGE_VERSION, timestampMs: Date.now() });
    }
    return JSON.stringify({
      ready: true,
      bridgeVersion: BRIDGE_VERSION,
      timestampMs: Date.now(),
      layer: highestLayer(),
      antimatter: formatValue(Currency.antimatter.value),
      antimatterPerSecond: formatValue(Currency.antimatter.productionPerSecond),
      infinityPoints: formatValue(Currency.infinityPoints.value),
      eternityPoints: formatValue(Currency.eternityPoints.value),
      realityMachines: formatValue(Currency.realityMachines.value),
      infinities: formatValue(Currency.infinities.value),
      eternities: formatValue(Currency.eternities.value),
      realities: formatValue(Currency.realities.value),
      dimensions: Array.from({ length: 8 }, (_, index) => dimension(index + 1)),
      resets: resetActions(),
      upgrades: upgradeList(),
      achievements: achievementList(),
      achievementUnlockedCount: number(() => Achievements.effectiveCount),
      achievementTotalCount: number(() => Achievements.all.length),
      milestones: milestoneList(),
      dimensionBoosts: number(() => player.dimensionBoosts),
      galaxies: number(() => player.galaxies),
      tickspeedCost: formatValue(safe(0, () => Tickspeed.cost)),
      tickspeedAffordable: bool(() => Tickspeed.isAvailableForPurchase && Tickspeed.isAffordable),
      challengeName: currentChallenge(),
      autosaveSeconds: Math.max(0, Math.floor((Date.now() - GameStorage.lastSaveTime) / 1000)),
      currentSaveSlot: number(() => GameStorage.currentSlot),
      recoverySaveAvailable: Boolean(localStorage.getItem("ADNativeRecoverySave"))
    });
  };

  const command = (name, payloadJson) => {
    if (!window.player) return JSON.stringify({ ok: false, event: "ERROR", message: "Game engine is not ready" });
    let payload = {};
    try { payload = payloadJson ? JSON.parse(payloadJson) : {}; } catch (_) { payload = {}; }
    try {
      let ok = false;
      let event = "PURCHASE";
      let significance = "LIGHT";
      let message = null;
      switch (name) {
        case "buyDimension": {
          const dim = AntimatterDimension(Number(payload.tier));
          ok = Boolean(dim && dim.isAvailableForPurchase && dim.isAffordableUntil10);
          if (ok) buyManyDimension(Number(payload.tier));
          break;
        }
        case "buyMaxDimension": {
          const dim = AntimatterDimension(Number(payload.tier));
          ok = Boolean(dim && dim.isAvailableForPurchase && dim.isAffordableUntil10);
          if (ok) buyMaxDimension(Number(payload.tier));
          break;
        }
        case "buyTickspeed":
          ok = bool(() => Tickspeed.isAvailableForPurchase && Tickspeed.isAffordable);
          if (ok) payload.max ? buyMaxTickSpeed() : buyTickSpeed();
          break;
        case "dimensionBoost":
          ok = bool(() => DimBoost.canBeBought && DimBoost.requirement.isSatisfied);
          if (ok) requestDimensionBoost(Boolean(payload.bulk));
          event = "PRESTIGE";
          significance = "MEDIUM";
          break;
        case "galaxy":
          ok = Boolean(requestGalaxyReset(Boolean(payload.bulk)));
          event = "PRESTIGE";
          significance = "MEDIUM";
          break;
        case "infinity":
          ok = bool(() => Player.canCrunch);
          if (ok) bigCrunchResetRequest(true);
          event = "PRESTIGE";
          significance = "HEAVY";
          break;
        case "eternity":
          ok = bool(() => Player.canEternity);
          if (ok) eternity(false, false);
          event = "PRESTIGE";
          significance = "HEAVY";
          break;
        case "purchaseUpgrade": {
          const upgrade = InfinityUpgrade[payload.id];
          ok = Boolean(upgrade && upgrade.purchase());
          break;
        }
        case "save":
          ok = bool(() => GameStorage.canSave());
          if (ok) GameStorage.save(false, true);
          event = "SAVE";
          message = ok ? "Game saved" : "Saving is currently unavailable";
          break;
        case "restoreRecovery": {
          const recovery = localStorage.getItem("ADNativeRecoverySave");
          if (recovery) {
            const decoded = GameSaveSerializer.deserialize(recovery);
            const validationError = GameStorage.checkPlayerObject(decoded);
            ok = !validationError;
            if (ok) GameStorage.import(recovery);
            message = ok ? "Pre-import save restored" : validationError;
          }
          event = ok ? "IMPORT" : "INVALID_ACTION";
          significance = "HEAVY";
          break;
        }
        case "setLegacyMode":
          document.documentElement.classList.toggle("android-native-host", !Boolean(payload.visible));
          ok = true;
          event = "NAVIGATION";
          break;
        default:
          return JSON.stringify({ ok: false, event: "ERROR", significance: "LIGHT", message: `Unknown command: ${name}` });
      }
      GameUI.update();
      return JSON.stringify({ ok, event: ok ? event : "INVALID_ACTION", significance, message });
    } catch (error) {
      return JSON.stringify({ ok: false, event: "ERROR", significance: "LIGHT", message: String(error && error.message ? error.message : error) });
    }
  };

  const exportSave = () => safe("", () => {
    if (!GameStorage.canSave()) return "";
    GameStorage.save(true);
    return GameStorage.exportModifiedSave();
  });

  const importSave = encoded => {
    try {
      const decoded = GameSaveSerializer.deserialize(encoded);
      const validationError = GameStorage.checkPlayerObject(decoded);
      if (validationError) {
        return JSON.stringify({ ok: false, event: "ERROR", significance: "LIGHT", message: validationError });
      }
      const current = exportSave();
      if (!current) {
        return JSON.stringify({
          ok: false,
          event: "INVALID_ACTION",
          significance: "LIGHT",
          message: "The current save cannot be backed up while this game action is active"
        });
      }
      localStorage.setItem("ADNativeRecoverySave", current);
      GameStorage.import(encoded);
      return JSON.stringify({ ok: true, event: "IMPORT", significance: "HEAVY", message: "Save imported" });
    } catch (error) {
      return JSON.stringify({ ok: false, event: "ERROR", significance: "LIGHT", message: String(error && error.message ? error.message : error) });
    }
  };

  window.ADMobileNative = { version: BRIDGE_VERSION, snapshot, command, exportSave, importSave };
  document.documentElement.classList.add("android-native-host");
})();

__AD_FILE_1_0__
