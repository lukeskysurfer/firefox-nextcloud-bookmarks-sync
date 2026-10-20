// ============================================
// Popup - Affichage de la progression de la synchronisation
// ============================================

// Crée l'élément de progression dans la status-section (fallback : après debug-info)
function getOrCreateProgressElement() {
  let progressElement = document.getElementById('sync-progress');
  if (progressElement) return progressElement;

  progressElement = document.createElement('div');
  progressElement.id = 'sync-progress';
  progressElement.className = 'sync-progress';

  const statusSection = document.getElementById('status-section');
  const debugInfo = document.getElementById('debug-info');
  if (statusSection) {
    statusSection.appendChild(progressElement);
  } else if (debugInfo) {
    debugInfo.parentNode.insertBefore(progressElement, debugInfo.nextSibling);
  } else {
    document.body.prepend(progressElement);
  }
  return progressElement;
}

// Résumé court des compteurs : « 12 local, 10 distant, +2 FF »…
const PROGRESS_STAT_LABELS = [
  ['localCount', n => `${n} local`, true],
  ['remoteCount', n => `${n} distant`, true],
  ['conflictCount', n => `${n} conflits`],
  ['addedToFirefox', n => `+${n} FF`],
  ['addedToNextcloud', n => `+${n} NC`],
  ['updatedInFirefox', n => `~${n} FF`],
  ['updatedInNextcloud', n => `~${n} NC`],
  ['deletedFromFirefox', n => `-${n} FF`],
  ['deletedFromNextcloud', n => `-${n} NC`]
];

function formatProgressStats(stats) {
  if (!stats) return '';
  const parts = PROGRESS_STAT_LABELS
    .filter(([key, , showZero]) => stats[key] !== undefined && (showZero || stats[key] > 0))
    .map(([key, format]) => format(stats[key]));
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

// Fin de synchronisation (succès ou erreur) : c'est le signal fiable pour rafraîchir
// l'état affiché et réactiver les boutons, plutôt qu'un délai fixe.
function showSyncFinished(progressElement, progress) {
  loadSyncStatus();
  loadConflicts();
  for (const id of ['sync-now', 'force-full-sync']) {
    const button = document.getElementById(id);
    if (button) button.disabled = false;
  }

  // Ne cache pas immédiatement, attends 2 secondes pour que l'utilisateur voie la fin
  progressElement.textContent = `✅ ${progress.message || 'Synchronisation terminée'}`;
  progressElement.style.animation = 'none';
  progressElement.style.color = 'var(--btn-success-bg)';
  setTimeout(() => {
    progressElement.textContent = '';
    progressElement.style.display = 'none';
  }, 2000);
}

// Met à jour l'affichage de la progression
function updateSyncProgress(progress) {
  const progressElement = getOrCreateProgressElement();

  if (progress.step === 'finished') {
    showSyncFinished(progressElement, progress);
    return;
  }

  progressElement.style.display = 'block';
  progressElement.style.animation = 'pulse 2s infinite';
  const percent = progress.percent !== null ? ` - ${progress.percent}%` : '';
  progressElement.textContent = `🔄 ${progress.message}${formatProgressStats(progress.stats)}${percent}`;
}
