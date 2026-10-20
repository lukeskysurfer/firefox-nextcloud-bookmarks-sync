// ============================================
// Popup - État de configuration et dernière synchronisation
// ============================================

async function isBackgroundAvailable() {
  try {
    const pingResponse = await browser.runtime.sendMessage({ action: 'ping' }).catch(() => null);
    return !!(pingResponse?.pong);
  } catch (error) {
    console.error('Ping échoué dans loadSyncStatus:', error);
    return false;
  }
}

function showConfigurationStatus(config, backgroundAvailable) {
  const statusElement = document.getElementById('sync-status');
  statusElement.className = '';
  if (config.nextcloudUrl && config.nextcloudUsername && config.nextcloudToken) {
    statusElement.textContent = backgroundAvailable ? 'Configuré ✓' : 'Configuré (BG indisponible)';
    statusElement.classList.add(backgroundAvailable ? 'status-configured' : 'status-bg-unavailable');
  } else {
    statusElement.textContent = 'Non configuré';
    statusElement.classList.add('status-unconfigured');
  }

  const lastSyncElement = document.getElementById('last-sync');
  lastSyncElement.textContent = config.lastSync
    ? new Date(config.lastSync).toLocaleString('fr-FR')
    : 'Jamais';
}

// Résumé de la dernière synchronisation (vide s'il n'y a rien eu à faire)
function formatLastSyncStats(stats) {
  const updated = stats.updatedInNextcloud + stats.updatedInFirefox;
  let text = '';
  if (stats.addedToNextcloud > 0) text += `+${stats.addedToNextcloud} vers NC `;
  if (stats.addedToFirefox > 0) text += `+${stats.addedToFirefox} vers FF `;
  if (stats.updatedInNextcloud > 0 || stats.updatedInFirefox > 0) text += `~${updated} mis à jour`;
  const hasOtherChanges = stats.addedToFirefox > 0 || stats.addedToNextcloud > 0 || updated > 0;
  if ((stats.deletedFromFirefox > 0 || stats.deletedFromNextcloud > 0) && hasOtherChanges) {
    text += ` -${stats.deletedFromFirefox + stats.deletedFromNextcloud} supprimés`;
  }
  return text.trim();
}

function showLastSyncStats(stats) {
  // Supprime l'ancien élément de progression s'il existe
  document.getElementById('sync-progress')?.remove();
  if (!stats) return;

  const text = formatLastSyncStats(stats);
  const lastSyncParent = document.getElementById('last-sync').parentElement;
  if (!text || !lastSyncParent) return;

  const progressElement = document.createElement('div');
  progressElement.id = 'sync-progress';
  progressElement.textContent = text;
  lastSyncParent.appendChild(progressElement);
}

// Charge et affiche l'état de synchronisation
async function loadSyncStatus() {
  try {
    const backgroundAvailable = await isBackgroundAvailable();
    const config = await browser.storage.local.get([
      'nextcloudUrl',
      'nextcloudUsername',
      'nextcloudToken',
      'lastSync',
      'lastSyncStats'
    ]).catch(() => ({}));

    showConfigurationStatus(config, backgroundAvailable);
    showLastSyncStats(config.lastSyncStats);

    if (!backgroundAvailable) {
      const fb = document.getElementById('click-feedback');
      if (fb.textContent === '' || fb.textContent.includes('JS LOADED')) {
        showFeedback('⚠️ Background en cours de redémarrage. Attendez...', 'warning');
      }
    }
  } catch (error) {
    console.error('Erreur chargement état sync:', error);
  }
}
