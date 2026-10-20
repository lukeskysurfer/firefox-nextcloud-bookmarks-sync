// ============================================
// Background Script - Progression et notifications
// ============================================

// Port de connexion pour le popup (persistant)
let progressPort = null;

// Affiche une notification système si l'API est disponible (absente sur Firefox pour Android)
async function notifySafe(notificationId, options) {
  if (!browser.notifications || typeof browser.notifications.create !== 'function') {
    return;
  }
  try {
    await browser.notifications.create(notificationId, options);
  } catch (err) {
    console.warn('[NC-BOOKMARKS-SYNC] Notification indisponible:', err.message);
  }
}

// Fonction pour envoyer un message de progression au popup
function sendSyncProgress(step, message, stats = {}, percent = null) {
  try {
    const msg = {
      type: 'sync_progress',
      step: step,
      message: message,
      stats: stats,
      percent: percent,
      timestamp: Date.now()
    };
    console.log('[BACKGROUND] Envoi progression:', step, message);

    // 1. Essayer d'envoyer via sendMessage (pour popup ouvert)
    browser.runtime.sendMessage(msg).catch(() => {});

    // 2. Si un port est connecté (popup ouvert avec connect), envoyer via le port
    if (progressPort) {
      try {
        progressPort.postMessage(msg);
      } catch (e) {
        console.warn('[BACKGROUND] Port closed, message dropped:', e.message);
        progressPort = null;
      }
    }
  } catch (e) {
    console.error('[BACKGROUND] Erreur sendSyncProgress:', e);
  }
}

// Écouteur pour la connexion du popup
browser.runtime.onConnect.addListener((port) => {
  if (port.name === 'sync-progress') {
    progressPort = port;
    console.log('[BACKGROUND] Popup connecté pour la progression');
    port.onDisconnect.addListener(() => {
      progressPort = null;
      console.log('[BACKGROUND] Popup déconnecté');
    });
  }
});
