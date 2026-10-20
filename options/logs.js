// ============================================
// Page des options - Journal (logs)
// ============================================

const LOG_LEVEL_NAMES = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR'
};

function emptyState(icon, ...lines) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  const iconSpan = document.createElement('span');
  iconSpan.className = 'icon';
  iconSpan.textContent = icon;
  div.appendChild(iconSpan);
  for (const [text, className] of lines) {
    const p = document.createElement('p');
    p.textContent = text;
    if (className) p.className = className;
    div.appendChild(p);
  }
  return div;
}

// Charge les logs depuis le stockage
async function loadLogs() {
  const logsContainer = document.getElementById('logs-container');
  const logsCount = document.getElementById('logs-count');

  logsContainer.innerHTML = '<div class="loading">Chargement des logs...</div>';

  try {
    const data = await browser.storage.local.get('syncLogs');
    const logs = data.syncLogs || [];
    logsCount.textContent = logs.length;

    if (logs.length === 0) {
      logsContainer.replaceChildren(emptyState('📜',
        ['Aucun log disponible'],
        ['Activez les logs détaillés dans les paramètres avancés', 'help-text']));
      return;
    }

    displayLogs(logs);
    setupLogsFilter(logs);
  } catch (error) {
    const errDiv = document.createElement('div');
    errDiv.className = 'error';
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = '⚠️';
    const p = document.createElement('p');
    p.textContent = `Erreur de chargement des logs: ${error.message}`;
    errDiv.append(icon, p);
    logsContainer.replaceChildren(errDiv);
  }
}

function textSpan(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function renderLogEntry(log) {
  const levelName = LOG_LEVEL_NAMES[log.level] || 'UNKNOWN';
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.setAttribute('data-level', levelName);
  entry.append(
    textSpan('timestamp', new Date(log.timestamp).toLocaleString('fr-FR')),
    textSpan(`level ${levelName.toLowerCase()}`, levelName),
    textSpan('message', log.message)
  );

  if (log.context && Object.keys(log.context).length > 0) {
    const contextDiv = document.createElement('div');
    contextDiv.className = 'context';
    contextDiv.textContent = JSON.stringify(log.context).substring(0, 100);
    entry.appendChild(contextDiv);
  }
  return entry;
}

// Affiche les logs filtrés, les plus récents en premier
function displayLogs(logs) {
  const logsContainer = document.getElementById('logs-container');
  const filter = document.getElementById('logs-filter').value;
  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => LOG_LEVEL_NAMES[log.level] === filter);

  if (filteredLogs.length === 0) {
    logsContainer.replaceChildren(emptyState('🔍', ['Aucun log correspondant au filtre']));
    return;
  }

  const sortedLogs = [...filteredLogs].sort((a, b) => b.timestamp - a.timestamp);
  logsContainer.replaceChildren(...sortedLogs.map(renderLogEntry));
}

// Configure le filtre des logs
function setupLogsFilter(allLogs) {
  const filterSelect = document.getElementById('logs-filter');

  filterSelect.addEventListener('change', () => {
    displayLogs(allLogs);
  });
}

// Rafraîchit les logs
async function refreshLogs() {
  await loadLogs();
}

// Efface les logs
async function clearLogs() {
  if (!confirm('Êtes-vous sûr de vouloir effacer tous les logs ? Cette action est irréversible.')) {
    return;
  }

  try {
    await browser.storage.local.remove('syncLogs');
    showNotification('Logs effacés avec succès !', 'success');
    loadLogs();
  } catch (error) {
    showNotification(`Erreur lors de l'effacement: ${error.message}`, 'error');
  }
}

// Propose le téléchargement d'un fichier généré
function downloadFile(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Exporte les logs
async function exportLogs() {
  try {
    const data = await browser.storage.local.get('syncLogs');
    const logs = data.syncLogs || [];

    if (logs.length === 0) {
      showNotification('Aucun log à exporter', 'error');
      return;
    }

    downloadFile(JSON.stringify(logs, null, 2), 'application/json',
      `nextcloud-bookmarks-sync-logs_${new Date().toISOString().slice(0, 10)}.json`);
    showNotification('Logs exportés avec succès !', 'success');
  } catch (error) {
    showNotification(`Erreur lors de l'export: ${error.message}`, 'error');
  }
}
