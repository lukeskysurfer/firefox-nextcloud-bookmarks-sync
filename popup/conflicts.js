// ============================================
// Popup - Gestion des conflits
// ============================================

function setConflictsVisible(visible) {
  document.getElementById('conflicts-section').style.display = visible ? 'block' : 'none';
  document.getElementById('resolve-all-conflicts').style.display = visible ? 'inline-block' : 'none';
}

// Ligne « <strong>Firefox:</strong> titre »
function labelledLine(label, text) {
  const line = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = label;
  line.appendChild(strong);
  line.appendChild(document.createTextNode(` ${text}`));
  return line;
}

function resolveButton(index, btnClass, resolution, title, emoji) {
  const btn = document.createElement('button');
  btn.className = `btn btn-small ${btnClass} resolve-conflict`;
  btn.setAttribute('data-index', index);
  btn.setAttribute('data-resolution', resolution);
  btn.title = title;
  btn.textContent = emoji;
  btn.addEventListener('click', () => resolveConflict(index, resolution));
  return btn;
}

function renderConflictItem(conflict, index) {
  const item = document.createElement('div');
  item.className = 'conflict-item';
  item.setAttribute('data-index', index);

  const urlDiv = document.createElement('div');
  urlDiv.className = 'url';
  urlDiv.textContent = conflict.localBookmark.title || conflict.localBookmark.url;

  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'details';
  const diffLine = document.createElement('em');
  diffLine.textContent = `Différences: ${conflict.differences.join(', ')}`;
  detailsDiv.append(
    labelledLine('Firefox:', conflict.localBookmark.title),
    labelledLine('Nextcloud:', conflict.remoteBookmark.title),
    diffLine
  );

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';
  actionsDiv.append(
    resolveButton(index, 'btn-success', 'keepLocal', 'Garder Firefox', '💻'),
    resolveButton(index, 'btn-danger', 'keepRemote', 'Garder Nextcloud', '☁️'),
    resolveButton(index, 'btn-primary', 'merge', 'Fusionner (plus récent)', '🔄')
  );

  item.append(urlDiv, detailsDiv, actionsDiv);
  return item;
}

// Charge et affiche les conflits
async function loadConflicts() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getConflicts' });
    const conflicts = response ? response.conflicts : [];
    setConflictsVisible(conflicts.length > 0);
    if (conflicts.length === 0) return;

    document.getElementById('conflicts-count').textContent = `${conflicts.length} conflit(s) détecté(s)`;
    document.getElementById('conflicts-list').replaceChildren(...conflicts.map(renderConflictItem));
  } catch (error) {
    console.error('Erreur chargement conflits:', error);
    document.getElementById('conflicts-section').style.display = 'none';
  }
}

// Résout un conflit spécifique
async function resolveConflict(conflictIndex, resolution) {
  showFeedback('Résolution du conflit...', 'info');

  try {
    const response = await browser.runtime.sendMessage({
      action: 'resolveConflict',
      conflictIndex: parseInt(conflictIndex),
      resolution: resolution
    });

    if (response && response.success) {
      showFeedback('✅ Conflit résolu!', 'success');
      loadConflicts();
    } else {
      showFeedback('⚠️ Problème de résolution', 'warning');
    }
  } catch (error) {
    showFeedback('❌ Erreur: ' + error.message, 'error');
    console.error('Erreur résolution conflit:', error);
  }
}

// Résout tous les conflits automatiquement (fusion avec priorité à la version la plus récente)
async function resolveAllConflicts() {
  showFeedback('Résolution de tous les conflits...', 'info');
  try {
    const response = await browser.runtime.sendMessage({ action: 'resolveAllConflicts' });
    if (response && response.success) {
      showFeedback(`✅ ${response.resolved} conflit(s) résolu(s)!`, 'success');
      setConflictsVisible(false);
      loadConflicts(); // Recharger pour vérifier
    } else {
      showFeedback('⚠️ Problème: ' + (response ? response.error : 'Erreur inconnue'), 'warning');
    }
  } catch (error) {
    showFeedback('❌ Erreur: ' + error.message, 'error');
    console.error('Erreur resolveAllConflicts:', error);
  }
}
