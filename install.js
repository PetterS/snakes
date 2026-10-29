'use strict';
(() => {
  const hosted = location.protocol === 'https:' || location.protocol === 'http:';
  const displayMode = window.matchMedia('(display-mode: standalone)');
  let prompt = null, installed = false, offlineReady = false;
  const standalone = () => installed || navigator.standalone === true || displayMode.matches;

  function refresh() {
    document.querySelectorAll('.install-help').forEach(help => {
      help.hidden = standalone();
      help.querySelector('.install-button').hidden = !prompt;
      help.querySelector('.offline-status').textContent = offlineReady
        ? 'Spelet är redo att öppnas utan internet.'
        : 'Ladda spelet med internet för att förbereda spel utan uppkoppling.';
    });
  }
  window.DeepBelowInstall = {
    mount(panel) {
      if (!hosted || standalone()) return;
      panel.append(document.querySelector('#install-template').content.cloneNode(true));
      panel.querySelector('.install-button').addEventListener('click', async () => {
        if (!prompt) return;
        const request = prompt;
        prompt = null;
        refresh();
        try {
          await request.prompt();
          await request.userChoice;
        } catch { /* The manual installation steps remain available. */ }
      });
      refresh();
    },
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    prompt = null;
    refresh();
  });
  displayMode.addEventListener('change', refresh);

  if (hosted && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'})
        .then(() => navigator.serviceWorker.ready)
        .then(() => { offlineReady = true; refresh(); })
        .catch(() => { /* Storage restrictions must not prevent normal play. */ });
    });
  }
})();
