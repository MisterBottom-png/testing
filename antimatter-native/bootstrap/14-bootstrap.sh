#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
bridge = root / "app/src/main/assets/native/native-bridge.js"
test = root / "tools/bridge-mock-test.mjs"

bridge_text = bridge.read_text()
replacements = {
    'buyMode: "Buy 10"': 'buyMode: "Buy 1"',
    'cost: formatValue(dim.costUntil10),': 'cost: formatValue(dim.cost),',
    'affordable: bool(() => dim.isAffordableUntil10),': 'affordable: bool(() => dim.isAffordable),',
    'buyMode: safe("Buy 10", () => Laitela.continuumActive ? "Continuum" : `Buy ${formatInteger(dim.remainingUntil10)}`)': 'buyMode: safe("Buy 1", () => Laitela.continuumActive ? "Continuum" : "Buy 1")',
    'ok = Boolean(dim && dim.isAvailableForPurchase && dim.isAffordableUntil10);\n          if (ok) buyManyDimension(Number(payload.tier));': 'ok = Boolean(dim && dim.isAvailableForPurchase && dim.isAffordable);\n          if (ok) buyOneDimension(Number(payload.tier));',
    'ok = Boolean(dim && dim.isAvailableForPurchase && dim.isAffordableUntil10);\n          if (ok) buyMaxDimension(Number(payload.tier));': 'ok = Boolean(dim && dim.isAvailableForPurchase && dim.isAffordable);\n          if (ok) {\n            if (dim.isAffordableUntil10) buyMaxDimension(Number(payload.tier));\n            else buyAsManyAsYouCanBuy(Number(payload.tier));\n          }',
}
for old, new in replacements.items():
    if old not in bridge_text:
        raise SystemExit(f"Expected bridge fragment not found: {old[:80]}")
    bridge_text = bridge_text.replace(old, new)
bridge.write_text(bridge_text)

test_text = test.read_text()
test_replacements = {
    'costUntil10: 10 ** (index + 1),': 'cost: 10 ** (index + 1),\n  costUntil10: 10 ** (index + 2),',
    'isAffordableUntil10: index === 0,': 'isAffordable: index === 0,\n  isAffordableUntil10: false,',
    'buyManyDimension: tier => { dimensionData[tier - 1].bought += 1; return true; },': 'buyOneDimension: tier => { dimensionData[tier - 1].bought += 1; return true; },\n  buyAsManyAsYouCanBuy: tier => { dimensionData[tier - 1].bought += 1; return true; },',
    'if (!initial.ready || initial.dimensions.length !== 8) throw new Error("Snapshot mock contract failed");': 'if (!initial.ready || initial.dimensions.length !== 8 || initial.dimensions[0].cost !== "10" || initial.dimensions[0].buyMode !== "Buy 1") throw new Error("Snapshot mock contract failed");',
    'if (!buyMax.ok || dimensionData[0].bought !== 11) throw new Error("Buy-max command mock failed");': 'if (!buyMax.ok || dimensionData[0].bought !== 2) throw new Error("Buy-max fallback command failed");',
    'dimensionData[0].isAffordableUntil10 = false;': 'dimensionData[0].isAffordable = false;',
}
for old, new in test_replacements.items():
    if old not in test_text:
        raise SystemExit(f"Expected test fragment not found: {old[:80]}")
    test_text = test_text.replace(old, new)
test.write_text(test_text)
PY
