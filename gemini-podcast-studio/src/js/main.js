function initialiseApp() {
  loadPreferences(); applyTheme(); populateInputsFromState(); renderConnectionForms(); renderSpeakerCards();
  if (appState.script) resetHistory(); renderCurrentStage({ focus: false });
  els.saveState.textContent = 'Saved locally';
}
initialiseApp();

  
