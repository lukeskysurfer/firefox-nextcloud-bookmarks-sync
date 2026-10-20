// ============================================
// Gestion du thème (mode sombre)
// ============================================

/**
 * Applique le thème (clair ou sombre) au popup
 */
function applyTheme(isDark = false) {
  const html = document.documentElement;

  if (isDark) {
    html.classList.add('dark-mode');
    html.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    html.classList.remove('dark-mode');
    html.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  }
}

// ============================================
// Utilitaires - Affichage de messages de feedback
// ============================================

const FEEDBACK_CLASSES = {
  success: 'feedback-success',
  warning: 'feedback-warning',
  error: 'feedback-error'
};

/**
 * Affiche un message dans l'élément de feedback avec la classe CSS appropriée
 * @param {string} message - Le message à afficher
 * @param {string} type - Type du message: 'info', 'success', 'warning', 'error'
 */
function showFeedback(message, type = 'info') {
  const fb = document.getElementById('click-feedback');
  if (!fb) return;
  fb.className = FEEDBACK_CLASSES[type] || 'feedback-info';
  fb.textContent = message;
}

// Affiche un message de diagnostic dans #debug-info (masqué s'il n'y a rien à signaler)
function showDebugInfo(message) {
  const debugInfo = document.getElementById('debug-info');
  debugInfo.textContent = message;
  debugInfo.style.display = message ? 'block' : 'none';
}

async function pingBackground() {
  const response = await browser.runtime.sendMessage({ action: 'ping' }).catch(() => null);
  return !!(response && response.pong);
}

// ============================================
// Initialisation
// ============================================

// Reçoit la progression du background (port persistant + écouteur classique en secours)
function listenToSyncProgress() {
  const onProgress = (message) => {
    if (message.type === 'sync_progress') {
      updateSyncProgress(message);
    }
  };
  try {
    browser.runtime.connect({ name: 'sync-progress' }).onMessage.addListener(onProgress);
  } catch (e) {
    console.error('[POPUP] Erreur connexion port:', e);
    showDebugInfo('⚠️ Connexion au background impossible');
  }
  try {
    browser.runtime.onMessage.addListener(onProgress);
  } catch (e) {
    console.error('[POPUP] Erreur listener classique:', e);
  }
}

async function setupTheme() {
  const settings = await browser.storage.local.get('darkMode');
  applyTheme(settings.darkMode || false);
  browser.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.darkMode !== undefined) {
      applyTheme(changes.darkMode.newValue || false);
    }
  });
}

function checkBackground() {
  browser.runtime.sendMessage({ action: 'ping' }).then(response => {
    if (!response || !response.pong) {
      showDebugInfo('⚠️ Le script d\'arrière-plan ne répond pas');
    }
  }).catch(error => {
    showDebugInfo('⚠️ Script d\'arrière-plan indisponible (' + error.message + ')');
    console.error('Background not responding:', error);
  });
}

// Le background peut être en train de redémarrer : prévient l'utilisateur et revérifie dans 2 s
function reportBackgroundUnavailable() {
  updateSyncProgress({ step: 'error', message: 'Background non disponible. Attendez...', percent: null });
  console.error('Ping échoué: background script peut être en train de redémarrer');
  setTimeout(async () => {
    if (await pingBackground()) {
      updateSyncProgress({ step: 'finished', message: 'Background disponible. Réessayez.', percent: null });
    }
  }, 2000);
}

async function onSyncNow(button) {
  updateSyncProgress({ step: 'start', message: 'Initialisation...', percent: 0 });
  button.disabled = true;

  if (!(await pingBackground())) {
    button.disabled = false;
    reportBackgroundUnavailable();
    return;
  }

  // La progression arrive via updateSyncProgress, qui réactive le bouton au step 'finished'.
  browser.runtime.sendMessage({ action: 'sync' }).catch(() => {});
  // Filet de sécurité si ce message venait à ne jamais arriver (port fermé, etc.)
  setTimeout(() => {
    if (button.disabled) {
      loadSyncStatus();
      loadConflicts();
      button.disabled = false;
    }
  }, 60000);
}

async function onTestConnection() {
  showFeedback('Test en cours...', 'info');
  if (!(await pingBackground())) {
    showFeedback('⚠️ Background non disponible', 'warning');
    console.error('Ping échoué pour testConnection');
    return;
  }
  const response = await browser.runtime.sendMessage({ action: 'testConnection' }).catch(() => null);
  if (response && response.connected) {
    showFeedback(response.message, 'success');
  } else {
    showFeedback(response ? response.message : '❌ Pas de réponse du serveur', 'error');
  }
}

async function onForceFullSync(button) {
  updateSyncProgress({ step: 'start', message: 'Forçage sync complète...', percent: 0 });
  button.disabled = true;
  // La réponse n'arrive qu'une fois fullSync() réellement terminé
  const response = await browser.runtime.sendMessage({ action: 'forceFullSync' }).catch(() => null);
  if (response && response.success) {
    updateSyncProgress({ step: 'finished', message: '✅ Sync complète forcée !', percent: 100 });
    loadSyncStatus();
    loadConflicts();
  } else {
    updateSyncProgress({ step: 'error', message: '⚠️ ' + (response ? response.message : 'Problème'), percent: null });
  }
  button.disabled = false;
}

function bindButtons() {
  document.getElementById('open-options').addEventListener('click', () => {
    showFeedback('Ouverture...', 'info');
    browser.runtime.openOptionsPage();
  });
  document.getElementById('sync-now').addEventListener('click', function() { onSyncNow(this); });
  document.getElementById('test-connection').addEventListener('click', () => {
    onTestConnection().catch(error => {
      showFeedback('❌ Erreur: ' + error.message, 'error');
      console.error('Erreur test connection:', error);
    });
  });
  document.getElementById('force-full-sync').addEventListener('click', function() { onForceFullSync(this); });
  document.getElementById('resolve-all-conflicts').addEventListener('click', resolveAllConflicts);
  document.getElementById('resolve-all-btn').addEventListener('click', resolveAllConflicts);
}

// Charge les paramètres et applique le thème au démarrage
async function initPopup() {
  try {
    showDebugInfo('');

    // Polyfill browser si nécessaire (DOIT être fait AVANT d'utiliser browser)
    if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
      window.browser = window.chrome;
    }

    if (typeof browser !== 'undefined' && browser.runtime) {
      listenToSyncProgress();
    } else {
      console.error('[POPUP] browser.runtime non disponible !');
      showDebugInfo('⚠️ browser.runtime non disponible');
    }

    await setupTheme();

    if (typeof browser !== 'undefined' && browser.runtime?.openOptionsPage) {
      checkBackground();
      bindButtons();
      loadConflicts();
      loadSyncStatus();
    }
  } catch (e) {
    showDebugInfo('❌ Erreur: ' + e.message);
    document.getElementById('debug-info').classList.add('feedback-error');
    console.error('[POPUP] Erreur init:', e);
  }
}

// Initialise le popup une seule fois, au chargement de la page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
