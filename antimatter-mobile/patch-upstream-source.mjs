import fs from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve(process.argv[2] ?? "");
if (!sourceRoot || !fs.existsSync(sourceRoot)) {
  throw new Error(`Upstream source directory does not exist: ${sourceRoot}`);
}

const componentSource = path.resolve(process.argv[3] ?? "");
if (!componentSource || !fs.existsSync(componentSource)) {
  throw new Error(`Secrets/Cheats component does not exist: ${componentSource}`);
}

const componentDirectory = path.join(sourceRoot, "src/components/tabs/options-secrets-cheats");
const componentTarget = path.join(componentDirectory, "OptionsSecretsCheatsTab.vue");
fs.mkdirSync(componentDirectory, { recursive: true });
fs.copyFileSync(componentSource, componentTarget);

const indexPath = path.join(sourceRoot, "src/components/tabs/index.js");
let indexSource = fs.readFileSync(indexPath, "utf8");
const importLine = 'import OptionsSecretsCheatsTab from "./options-secrets-cheats/OptionsSecretsCheatsTab";';
if (!indexSource.includes(importLine)) {
  indexSource = indexSource.replace(
    'import OptionsSavingTab from "./options-saving/OptionsSavingTab";',
    `import OptionsSavingTab from "./options-saving/OptionsSavingTab";\n${importLine}`
  );
}
if (!indexSource.includes("  OptionsSecretsCheatsTab,")) {
  indexSource = indexSource.replace(
    "  OptionsGameplayTab,",
    "  OptionsGameplayTab,\n  OptionsSecretsCheatsTab,"
  );
}
fs.writeFileSync(indexPath, indexSource);

const tabsPath = path.join(sourceRoot, "src/core/secret-formula/tabs.js");
let tabsSource = fs.readFileSync(tabsPath, "utf8");
if (!tabsSource.includes('key: "secrets-cheats"')) {
  const gameplayPattern = /      \{\r?\n        key: "gameplay",\r?\n        name: "Gameplay",\r?\n        symbol: "<i class='fas fa-wrench'><\/i>",\r?\n        component: "OptionsGameplayTab",\r?\n        id: 2,\r?\n        hidable: false,\r?\n      \}/u;
  const replacement = `      {
        key: "gameplay",
        name: "Gameplay",
        symbol: "<i class='fas fa-wrench'></i>",
        component: "OptionsGameplayTab",
        id: 2,
        hidable: false,
      },
      {
        key: "secrets-cheats",
        name: "Secrets & Cheats",
        symbol: "<i class='fas fa-flask'></i>",
        component: "OptionsSecretsCheatsTab",
        id: 3,
        hidable: false,
      }`;
  if (!gameplayPattern.test(tabsSource)) {
    throw new Error("Could not find the Options Gameplay subtab block in upstream tabs.js");
  }
  tabsSource = tabsSource.replace(gameplayPattern, replacement);
}
fs.writeFileSync(tabsPath, tabsSource);

console.log("Added Options > Secrets & Cheats to upstream source.");
