<script>
const SECRET_THEMES = [
  { id: 1, name: "Christmas" },
  { id: 2, name: "Secret Theme 2" },
  { id: 3, name: "Secret Theme 3" },
  { id: 4, name: "Design" },
  { id: 5, name: "Secret Theme 5" },
  { id: 6, name: "Secret Theme 6" },
  { id: 7, name: "Secret Theme 7" },
  { id: 8, name: "Secret Theme 8" },
  { id: 9, name: "Blind" },
  { id: 10, name: "Secret Theme 10" },
  { id: 11, name: "Blob" },
  { id: 12, name: "Windows Desktop" },
];

export default {
  name: "OptionsSecretsCheatsTab",
  data() {
    return {
      resourceExponent: 1000,
      glyphLevel: 10000,
      command: "dev.giveAllAchievements()",
      commandResult: "",
      secretThemes: SECRET_THEMES,
      sectionOpen: {
        secrets: true,
        progression: true,
        resources: true,
        visuals: false,
        console: false,
        danger: false,
      },
    };
  },
  methods: {
    toggleSection(section) {
      this.sectionOpen[section] = !this.sectionOpen[section];
    },
    notify(message, type = "info") {
      if (type === "error") GameUI.notify.error(message, 5000);
      else if (type === "success") GameUI.notify.success(message, 5000);
      else GameUI.notify.info(message, 5000);
    },
    runAction(label, action, options = {}) {
      if (options.confirm && !window.confirm(options.confirm)) return;
      try {
        if (options.saveBefore !== false) GameStorage.save();
        const result = action();
        if (options.saveAfter !== false) GameStorage.save();
        this.notify(`${label} completed.`);
        return result;
      } catch (error) {
        console.error(error);
        this.notify(`${label} failed: ${error.message || error}`, "error");
        return undefined;
      }
    },
    exportBackup() {
      this.runAction("Save export", () => GameStorage.export(), { saveAfter: false });
    },
    openImport() {
      Modal.import.show();
    },
    unlockSecretAchievement(id, label) {
      this.runAction(label, () => SecretAchievement(id).unlock());
    },
    barrelRollSecret() {
      this.runAction("Barrel roll secret", () => {
        dev.barrelRoll();
        SecretAchievement(15).unlock();
      });
    },
    unlockKonami() {
      this.runAction("Konami code", () => {
        SecretAchievement(17).unlock();
        Currency.antimatter.bumpTo(30);
        Speedrun.startTimer();
      });
    },
    revealSecretTimeStudy() {
      this.runAction("Secret Time Study", () => {
        player.secretUnlocks.viewSecretTS = true;
        SecretAchievement(21).unlock();
      });
    },
    unlockSpeedrun() {
      this.runAction("Speedrun mode", () => Speedrun.unlock());
    },
    unlockTheme(theme, apply = true) {
      this.runAction(`Secret theme S${theme.id}`, () => {
        const prefix = `S${theme.id}`;
        const fullName = `${prefix}${theme.name}`;
        const existing = Array.from(player.secretUnlocks.themes)
          .find(entry => entry.startsWith(prefix));
        if (existing) player.secretUnlocks.themes.delete(existing);
        player.secretUnlocks.themes.add(fullName);
        SecretAchievement(25).unlock();
        if (apply) Theme.set(prefix);
      });
    },
    unlockAllThemes() {
      this.runAction("All secret themes", () => {
        for (const theme of this.secretThemes) {
          const prefix = `S${theme.id}`;
          const existing = Array.from(player.secretUnlocks.themes)
            .find(entry => entry.startsWith(prefix));
          if (existing) player.secretUnlocks.themes.delete(existing);
          player.secretUnlocks.themes.add(`${prefix}${theme.name}`);
        }
        SecretAchievement(25).unlock();
      });
    },
    openWindowsGames() {
      this.runAction("Windows Games menu", () => {
        const theme = this.secretThemes.find(entry => entry.id === 12);
        const existing = Array.from(player.secretUnlocks.themes)
          .find(entry => entry.startsWith("S12"));
        if (existing) player.secretUnlocks.themes.delete(existing);
        player.secretUnlocks.themes.add(`S12${theme.name}`);
        Theme.set("S12");
        setTimeout(() => Modal.s12Games.show(), 250);
      });
    },
    setCurrency(currencyName) {
      const exponent = Math.max(1, Math.min(1e9, Number(this.resourceExponent) || 1));
      this.resourceExponent = exponent;
      this.runAction(`${currencyName} to 1e${exponent}`, () => {
        const currency = Currency[currencyName];
        if (!currency) throw new Error(`Unknown currency ${currencyName}`);
        currency.bumpTo(Decimal.pow10(exponent));
      }, {
        confirm: `Raise ${currencyName} to 1e${exponent}? This permanently changes the current save.`,
      });
    },
    grantPerkPoints() {
      this.runAction("Perk points", () => {
        Currency.perkPoints.value = Math.max(Currency.perkPoints.value, 1000000);
      });
    },
    grantImaginaryMachines() {
      this.runAction("Imaginary Machines", () => {
        player.reality.imaginaryMachines = Number.MAX_VALUE;
      }, {
        confirm: "Set Imaginary Machines to an extreme value? This can skip progression and may produce unusual states.",
      });
    },
    giveGlyph(reality = false) {
      const level = Math.max(1, Math.min(1e9, Number(this.glyphLevel) || 1));
      this.glyphLevel = level;
      this.runAction(reality ? "Reality Glyph" : "Glyph", () => {
        if (reality) dev.giveRealityGlyph(level);
        else dev.giveGlyph(level);
      });
    },
    buyAllPerks() {
      this.runAction("All perks", () => {
        Currency.perkPoints.value = Math.max(Currency.perkPoints.value, 1000000);
        dev.buyAllPerks();
      });
    },
    grantAllAchievements() {
      this.runAction("All achievements", () => dev.giveAllAchievements(), {
        confirm: "Unlock every normal and secret achievement on this save?",
      });
    },
    unlockAutomator() {
      this.runAction("Automator", () => dev.unlockAutomator());
    },
    unlockCosmetics() {
      this.runAction("All cosmetic sets", () => dev.unlockAllCosmeticSets());
    },
    togglePerformanceStats() {
      this.runAction("Performance statistics", () => dev.togglePerformanceStats(), {
        saveBefore: false,
        saveAfter: false,
      });
    },
    runAnimation(name) {
      const action = dev[name];
      if (typeof action !== "function") {
        this.notify(`Animation command ${name} is unavailable.`, "error");
        return;
      }
      this.runAction(name, () => action(), { saveBefore: false, saveAfter: false });
    },
    fixSave() {
      this.runAction("Save repair", () => dev.fixSave(), {
        confirm: "Attempt to repair NaN values in this save? Export a backup first. This operation rewrites the save.",
      });
    },
    openHiddenTabs() {
      Modal.hiddenTabs.show();
    },
    runCommand() {
      const source = this.command.trim();
      if (!source) return;
      const dangerous = /\b(?:doubleEverything|tripleEverything|hardReset)\b/u.test(source);
      if (dangerous && !window.confirm(
        "This command is known to be destructive or broken. Continue only if you have exported a backup."
      )) return;
      try {
        GameStorage.save();
        const result = window.eval(source);
        this.commandResult = result instanceof Promise
          ? "Command started and returned a Promise. Check the game or console for completion."
          : (result === undefined ? "Command completed." : String(result));
        GameStorage.save();
        this.notify("Developer command executed.");
      } catch (error) {
        console.error(error);
        this.commandResult = `${error.name || "Error"}: ${error.message || error}`;
        this.notify("Developer command failed.", "error");
      }
    },
    hardReset() {
      Modal.hardReset.show();
    },
  }
};
</script>

<template>
  <div class="l-options-tab c-secrets-cheats-tab">
    <div class="c-secrets-cheats-header">
      <h1>Secrets &amp; Cheats</h1>
      <p>
        These controls expose the game's hidden import codes, keyboard secrets, themes, developer utilities,
        and global JavaScript command system. Export a save before changing progression.
      </p>
      <div class="c-secrets-cheats-backup-row">
        <button class="o-primary-btn c-cheat-button c-cheat-button--safe" @click="exportBackup">
          Export backup
        </button>
        <button class="o-primary-btn c-cheat-button" @click="openImport">
          Open save/code import
        </button>
        <button class="o-primary-btn c-cheat-button" @click="openHiddenTabs">
          Open hidden-tabs menu
        </button>
      </div>
    </div>

    <section class="c-cheat-section">
      <button class="c-cheat-section__title" @click="toggleSection('secrets')">
        <span>Player-facing secrets</span><span>{{ sectionOpen.secrets ? '−' : '+' }}</span>
      </button>
      <div v-if="sectionOpen.secrets" class="c-cheat-section__content">
        <h3>Secret codes and keyboard-only triggers</h3>
        <div class="c-cheat-grid">
          <button class="o-primary-btn c-cheat-button" @click="barrelRollSecret">DO A BARREL ROLL</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockSecretAchievement(14, 'IEATASS secret')">IEATASS</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockSpeedrun">SPEEDRUN unlock</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockSecretAchievement(37, 'Time Study importer secret')">Time Study: tree</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockKonami">Konami code / 30 Lives</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockSecretAchievement(13, 'Pay respects')">Keyboard F</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockSecretAchievement(41, 'Ninth Dimension secret')">Keyboard 9</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockSecretAchievement(23, 'Open console achievement')">Open-console achievement</button>
          <button class="o-primary-btn c-cheat-button" @click="revealSecretTimeStudy">Reveal Secret Time Study</button>
          <button class="o-primary-btn c-cheat-button" @click="openWindowsGames">Open hidden Windows Games menu</button>
        </div>

        <h3>Secret themes</h3>
        <div class="c-cheat-grid c-cheat-grid--themes">
          <button
            v-for="theme in secretThemes"
            :key="theme.id"
            class="o-primary-btn c-cheat-button"
            @click="unlockTheme(theme)"
          >
            S{{ theme.id }}: {{ theme.name }}
          </button>
        </div>
        <button class="o-primary-btn c-cheat-button c-cheat-button--wide" @click="unlockAllThemes">
          Unlock all 12 secret themes
        </button>
      </div>
    </section>

    <section class="c-cheat-section">
      <button class="c-cheat-section__title" @click="toggleSection('progression')">
        <span>Developer progression utilities</span><span>{{ sectionOpen.progression ? '−' : '+' }}</span>
      </button>
      <div v-if="sectionOpen.progression" class="c-cheat-section__content">
        <div class="c-cheat-grid">
          <button class="o-primary-btn c-cheat-button" @click="grantAllAchievements">Grant all achievements</button>
          <button class="o-primary-btn c-cheat-button" @click="buyAllPerks">Grant and buy all perks</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockAutomator">Unlock Automator</button>
          <button class="o-primary-btn c-cheat-button" @click="unlockCosmetics">Unlock all cosmetic sets</button>
          <button class="o-primary-btn c-cheat-button" @click="grantPerkPoints">Grant 1,000,000 perk points</button>
          <button class="o-primary-btn c-cheat-button" @click="grantImaginaryMachines">Max Imaginary Machines</button>
          <button class="o-primary-btn c-cheat-button" @click="togglePerformanceStats">Toggle performance stats</button>
          <button class="o-primary-btn c-cheat-button" @click="fixSave">Attempt save repair</button>
        </div>
        <div class="c-cheat-inline-form">
          <label for="glyph-level">Glyph level</label>
          <input id="glyph-level" v-model.number="glyphLevel" type="number" min="1" max="1000000000">
          <button class="o-primary-btn c-cheat-button" @click="giveGlyph(false)">Give Glyph</button>
          <button class="o-primary-btn c-cheat-button" @click="giveGlyph(true)">Give Reality Glyph</button>
        </div>
      </div>
    </section>

    <section class="c-cheat-section">
      <button class="c-cheat-section__title" @click="toggleSection('resources')">
        <span>Direct resource modification</span><span>{{ sectionOpen.resources ? '−' : '+' }}</span>
      </button>
      <div v-if="sectionOpen.resources" class="c-cheat-section__content">
        <div class="c-cheat-inline-form">
          <label for="resource-exponent">Set selected Decimal currency to 10^</label>
          <input id="resource-exponent" v-model.number="resourceExponent" type="number" min="1" max="1000000000">
        </div>
        <div class="c-cheat-grid">
          <button class="o-primary-btn c-cheat-button" @click="setCurrency('antimatter')">Antimatter</button>
          <button class="o-primary-btn c-cheat-button" @click="setCurrency('infinityPoints')">Infinity Points</button>
          <button class="o-primary-btn c-cheat-button" @click="setCurrency('eternityPoints')">Eternity Points</button>
          <button class="o-primary-btn c-cheat-button" @click="setCurrency('timeTheorems')">Time Theorems</button>
          <button class="o-primary-btn c-cheat-button" @click="setCurrency('realityMachines')">Reality Machines</button>
        </div>
        <p class="c-cheat-note">
          Resource injection bypasses normal unlock checks and may create impossible game states. The advanced console below
          can access every other global object, including <code>player</code>, <code>Currency</code>, and <code>GameStorage</code>.
        </p>
      </div>
    </section>

    <section class="c-cheat-section">
      <button class="c-cheat-section__title" @click="toggleSection('visuals')">
        <span>Visual and prestige-animation tests</span><span>{{ sectionOpen.visuals ? '−' : '+' }}</span>
      </button>
      <div v-if="sectionOpen.visuals" class="c-cheat-section__content">
        <div class="c-cheat-grid">
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('barrelRoll')">Barrel roll</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('spin3d')">Toggle 3D spin</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('spin4d')">Toggle 4D spin</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('implode')">Big Crunch animation</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('eternify')">Eternity animation</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('dilate')">Dilation animation</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('undilate')">Undilation animation</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('realize')">Reality animation</button>
          <button class="o-primary-btn c-cheat-button" @click="runAnimation('cancerize')">Emoji / Design mode</button>
        </div>
      </div>
    </section>

    <section class="c-cheat-section c-cheat-section--console">
      <button class="c-cheat-section__title" @click="toggleSection('console')">
        <span>Advanced JavaScript command console</span><span>{{ sectionOpen.console ? '−' : '+' }}</span>
      </button>
      <div v-if="sectionOpen.console" class="c-cheat-section__content">
        <p class="c-cheat-warning">
          This executes JavaScript inside the game with access to all global systems. It is as powerful and unsafe as
          Chrome DevTools. Export a backup first. Broken commands such as <code>dev.doubleEverything()</code> and
          <code>dev.tripleEverything()</code> are deliberately not offered as buttons.
        </p>
        <textarea
          v-model="command"
          class="c-cheat-console-input"
          spellcheck="false"
          rows="5"
          aria-label="Developer command"
        ></textarea>
        <button class="o-primary-btn c-cheat-button c-cheat-button--wide" @click="runCommand">
          Execute command
        </button>
        <pre v-if="commandResult" class="c-cheat-console-result">{{ commandResult }}</pre>
        <div class="c-cheat-command-examples">
          <button class="o-primary-btn c-cheat-button" @click="command = 'dev.giveAllAchievements()'">Achievements command</button>
          <button class="o-primary-btn c-cheat-button" @click="command = 'Currency.antimatter.bumpTo(Decimal.pow10(1000)); GameStorage.save()'">Antimatter command</button>
          <button class="o-primary-btn c-cheat-button" @click="command = 'dev.giveGlyph(10000)'">Glyph command</button>
          <button class="o-primary-btn c-cheat-button" @click="command = 'dev.unlockAutomator()'">Automator command</button>
        </div>
      </div>
    </section>

    <section class="c-cheat-section c-cheat-section--danger">
      <button class="c-cheat-section__title" @click="toggleSection('danger')">
        <span>Danger zone</span><span>{{ sectionOpen.danger ? '−' : '+' }}</span>
      </button>
      <div v-if="sectionOpen.danger" class="c-cheat-section__content">
        <p class="c-cheat-warning">
          <code>dev.doubleEverything()</code> and <code>dev.tripleEverything()</code> are known broken upstream and are
          intentionally disabled. Hard reset remains available through the game's normal confirmation modal.
        </p>
        <button class="o-primary-btn c-cheat-button c-cheat-button--danger" @click="hardReset">
          Open hard-reset confirmation
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.c-secrets-cheats-tab {
  width: min(100%, 96rem);
  color: var(--color-text);
  margin: 0 auto;
  padding: 1.2rem 1.2rem 14rem;
}

.c-secrets-cheats-header {
  width: 100%;
  background: color-mix(in srgb, var(--color-base) 90%, transparent);
  border: 0.1rem solid var(--color-accent);
  border-radius: var(--var-border-radius, 0.8rem);
  margin-bottom: 1rem;
  padding: 1.4rem;
}

.c-secrets-cheats-header h1 {
  font-size: 2.2rem;
  margin: 0 0 0.7rem;
}

.c-secrets-cheats-header p,
.c-cheat-note,
.c-cheat-warning {
  font-size: 1.25rem;
  line-height: 1.45;
}

.c-secrets-cheats-backup-row,
.c-cheat-grid,
.c-cheat-command-examples {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 0.8rem;
}

.c-secrets-cheats-backup-row {
  margin-top: 1.2rem;
}

.c-cheat-section {
  width: 100%;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-base) 94%, transparent);
  border: 0.1rem solid color-mix(in srgb, var(--color-text) 20%, transparent);
  border-radius: var(--var-border-radius, 0.8rem);
  margin: 0.9rem 0;
}

.c-cheat-section--console {
  border-color: var(--color-accent);
}

.c-cheat-section--danger {
  border-color: var(--color-bad);
}

.c-cheat-section__title {
  display: flex;
  width: 100%;
  min-height: 5rem;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  font: inherit;
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-base) 82%, var(--color-accent) 18%);
  border: 0;
  padding: 1rem 1.3rem;
  cursor: pointer;
}

.c-cheat-section__content {
  padding: 1.2rem;
}

.c-cheat-section__content h3 {
  font-size: 1.45rem;
  margin: 0.6rem 0 1rem;
}

.c-cheat-section__content h3:not(:first-child) {
  margin-top: 1.8rem;
}

.c-cheat-button {
  width: 100%;
  min-height: 5rem;
  height: auto;
  white-space: normal;
  font-size: 1.2rem;
  line-height: 1.25;
  padding: 0.8rem;
}

.c-cheat-button--safe {
  border-color: var(--color-good);
}

.c-cheat-button--danger {
  border-color: var(--color-bad);
}

.c-cheat-button--wide {
  width: 100%;
  margin-top: 0.8rem;
}

.c-cheat-inline-form {
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) minmax(10rem, 16rem) repeat(2, minmax(14rem, 1fr));
  gap: 0.8rem;
  align-items: center;
  margin: 1rem 0;
}

.c-cheat-inline-form label {
  text-align: left;
  font-size: 1.25rem;
}

.c-cheat-inline-form input,
.c-cheat-console-input {
  width: 100%;
  font-family: Typewriter, monospace;
  font-size: 1.4rem;
  color: var(--color-text);
  background: var(--color-base);
  border: 0.1rem solid var(--color-accent);
  border-radius: var(--var-border-radius, 0.5rem);
  padding: 0.8rem;
}

.c-cheat-console-input {
  min-height: 12rem;
  resize: vertical;
}

.c-cheat-console-result {
  overflow: auto;
  max-height: 20rem;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 1.2rem;
  color: var(--color-text);
  background: rgba(0, 0, 0, 35%);
  border-radius: var(--var-border-radius, 0.5rem);
  margin-top: 0.8rem;
  padding: 1rem;
}

.c-cheat-warning {
  text-align: left;
  background: color-mix(in srgb, var(--color-bad) 18%, transparent);
  border-left: 0.4rem solid var(--color-bad);
  margin: 0 0 1rem;
  padding: 1rem;
}

.c-cheat-note {
  text-align: left;
  opacity: 0.85;
  margin: 1rem 0 0;
}

.c-cheat-command-examples {
  margin-top: 0.8rem;
}

code {
  font-family: monospace;
}

@media (max-width: 700px) {
  .c-secrets-cheats-tab {
    padding: 0.7rem 0.7rem 16rem;
  }

  .c-cheat-inline-form {
    grid-template-columns: 1fr;
  }

  .c-secrets-cheats-backup-row,
  .c-cheat-grid,
  .c-cheat-command-examples {
    grid-template-columns: 1fr 1fr;
  }

  .c-cheat-button {
    min-height: 5.4rem;
    font-size: 1.15rem;
  }
}

@media (max-width: 430px) {
  .c-secrets-cheats-backup-row,
  .c-cheat-grid,
  .c-cheat-command-examples {
    grid-template-columns: 1fr;
  }
}
</style>
