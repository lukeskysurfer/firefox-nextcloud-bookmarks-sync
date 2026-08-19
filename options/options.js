// ============================================
// Page des options - Logique principale
// ============================================

// Polyfill pour Firefox - Assure la compatibilité browser/chrome API
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  window.browser = window.chrome;
}

// Attend que le DOM soit chargé
document.addEventListener('DOMContentLoaded', async () => {
  // Charge la configuration
  await loadSettings();
  
  // Initialise les onglets
  initTabs();
  
  // Configure les écouteurs d'événements
  setupEventListeners();
  
  // Initialise le toggle du thème
  setupThemeToggle();
  
  // Gère le hash initial dans l'URL (ex: #bookmarks)
  handleHashChange();
});

// Écoute les changements de hash (pour la navigation directe)
window.addEventListener('hashchange', handleHashChange);

// ============================================
// Gestion des onglets
// ============================================

function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Retire la classe active de tous les onglets
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Ajoute la classe active à l'onglet cliqué
      tab.classList.add('active');
      
      // Affiche le contenu correspondant
      const tabId = tab.dataset.tab;
      document.getElementById(`${tabId}-tab`).classList.add('active');
      
      // Charge les données si nécessaire
      if (tabId === 'bookmarks') {
        loadBookmarks();
      } else if (tabId === 'logs') {
        loadLogs();
      }
    });
  });
}

// Gère la navigation par hash (ex: #bookmarks)
function handleHashChange() {
  const hash = window.location.hash.slice(1); // Enlève le #
  if (hash) {
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Retire la classe active de tous
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // Active l'onglet correspondant
    const tab = document.querySelector(`.nav-tab[data-tab="${hash}"]`);
    if (tab) {
      tab.classList.add('active');
      document.getElementById(`${hash}-tab`).classList.add('active');
      
      // Charge les données si nécessaire
      if (hash === 'bookmarks') {
        loadBookmarks();
      } else if (hash === 'logs') {
        loadLogs();
      }
    }
  }
}

// ============================================
// Chargement/Sauvegarde des paramètres
// ============================================

// Charge les paramètres depuis le stockage
async function loadSettings() {
  const settings = await browser.storage.local.get([
    'nextcloudUrl',
    'nextcloudUsername',
    'nextcloudToken',
    'syncInterval',
    'autoSync',
    'syncOnStartup',
    'resolveConflictsAuto',
    'maxLogEntries',
    'enableLogs',
    'enableBatchProcessing',
    'cacheTtl',
    'batchSize',
    'darkMode'
  ]);

  // Valeurs par défaut pour c.netark.fr
  const defaults = {
    nextcloudUrl: 'https://c.netark.fr',
    nextcloudUsername: 'luke',
    nextcloudToken: '***REMOVED-TOKEN***',
    syncInterval: 5,
    autoSync: true,
    syncOnStartup: false,
    resolveConflictsAuto: false,
    maxLogEntries: 50,
    enableLogs: false,
    enableBatchProcessing: true,
    cacheTtl: 10,
    batchSize: 50,
    darkMode: false
  };

  // Remplit les champs du formulaire avec les valeurs sauvegardées ou les défauts
  document.getElementById('nextcloud-url').value = settings.nextcloudUrl || defaults.nextcloudUrl;
  document.getElementById('nextcloud-username').value = settings.nextcloudUsername || defaults.nextcloudUsername;
  document.getElementById('nextcloud-token').value = settings.nextcloudToken || defaults.nextcloudToken;
  document.getElementById('sync-interval').value = settings.syncInterval || defaults.syncInterval;
  document.getElementById('auto-sync').checked = settings.autoSync !== false && defaults.autoSync;
  document.getElementById('sync-on-startup').checked = settings.syncOnStartup || defaults.syncOnStartup;
  document.getElementById('resolve-conflicts-auto').checked = settings.resolveConflictsAuto || defaults.resolveConflictsAuto;
  document.getElementById('max-log-entries').value = settings.maxLogEntries || defaults.maxLogEntries;
  document.getElementById('enable-logs').checked = settings.enableLogs || defaults.enableLogs;
  document.getElementById('enable-batch-processing').checked = settings.enableBatchProcessing !== false && defaults.enableBatchProcessing;
  document.getElementById('cache-ttl').value = settings.cacheTtl || defaults.cacheTtl;
  document.getElementById('batch-size').value = settings.batchSize || defaults.batchSize;
  document.getElementById('dark-mode').checked = settings.darkMode || defaults.darkMode;
  
  // Applique le thème
  applyTheme(settings.darkMode || defaults.darkMode);
}

// Sauvegarde les paramètres
async function saveSettings() {
  const settings = {
    nextcloudUrl: document.getElementById('nextcloud-url').value.trim(),
    nextcloudUsername: document.getElementById('nextcloud-username').value.trim(),
    nextcloudToken: document.getElementById('nextcloud-token').value.trim(),
    syncInterval: parseInt(document.getElementById('sync-interval').value) || 5,
    autoSync: document.getElementById('auto-sync').checked,
    syncOnStartup: document.getElementById('sync-on-startup').checked,
    resolveConflictsAuto: document.getElementById('resolve-conflicts-auto').checked,
    maxLogEntries: parseInt(document.getElementById('max-log-entries').value) || 50,
    enableLogs: document.getElementById('enable-logs').checked,
    enableBatchProcessing: document.getElementById('enable-batch-processing').checked,
    cacheTtl: parseInt(document.getElementById('cache-ttl').value) || 10,
    batchSize: parseInt(document.getElementById('batch-size').value) || 50,
    darkMode: document.getElementById('dark-mode').checked
  };

  await browser.storage.local.set(settings);
  
  // Applique le thème immédiatement
  applyTheme(settings.darkMode);
  
  // Recharge le background script pour appliquer les changements
  const background = await browser.runtime.getBackgroundPage();
  if (background) {
    background.setupAutoSync();
  }
  
  showNotification('Paramètres enregistrés avec succès !', 'success');
}

// ============================================
// Gestion du thème (mode sombre)
// ============================================

/**
 * Applique le thème (clair ou sombre) à la page
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
  
  // Met à jour le toggle
  const toggle = document.getElementById('dark-mode');
  if (toggle) {
    toggle.checked = isDark;
  }
}

// Écouteur pour le toggle du mode sombre
function setupThemeToggle() {
  const toggle = document.getElementById('dark-mode');
  if (toggle) {
    toggle.addEventListener('change', function() {
      applyTheme(this.checked);
    });
  }
}

// ============================================
// Test de connexion
// ============================================

async function testConnection() {
  const url = document.getElementById('nextcloud-url').value.trim();
  const username = document.getElementById('nextcloud-username').value.trim();
  const token = document.getElementById('nextcloud-token').value.trim();

  if (!url || !username || !token) {
    showNotification('Veuillez remplir tous les champs', 'error');
    return;
  }

  const statusElement = document.getElementById('connection-status');
  statusElement.textContent = 'Test en cours...';
  statusElement.className = 'connection-status';
  statusElement.style.display = 'block';

  try {
    // Crée une instance temporaire de l'API
    const api = new window.NextcloudBookmarksAPI(url, username, token);
    const result = await api.testConnection();
    
    if (result.connected) {
      statusElement.textContent = '✅ Connexion réussie !';
      statusElement.className = 'connection-status connected';
      showNotification('Connexion à Nextcloud: Succès', 'success');
    } else {
      statusElement.textContent = `❌ ${result.message}`;
      statusElement.className = 'connection-status error';
      showNotification(`Connexion échouée: ${result.message}`, 'error');
    }
  } catch (error) {
    statusElement.textContent = `❌ ${error.message}`;
    statusElement.className = 'connection-status error';
    showNotification(`Erreur: ${error.message}`, 'error');
  }
}

// ============================================
// Gestion des marque-pages
// ============================================

// Charge les marque-pages depuis Firefox et Nextcloud
async function loadBookmarks() {
  const bookmarksList = document.getElementById('bookmarks-list');
  const localCount = document.getElementById('local-count');
  const nextcloudCount = document.getElementById('nextcloud-count');

  bookmarksList.innerHTML = '<div class="loading">Chargement en cours...</div>';

  try {
    // Récupère les marque-pages Firefox
    const firefoxBookmarks = await browser.bookmarks.search({});
    const validFirefoxBookmarks = firefoxBookmarks.filter(b => b.url && !b.url.startsWith('place:'));
    
    // Récupère les marque-pages Nextcloud
    const config = await browser.storage.local.get(['nextcloudUrl', 'nextcloudUsername', 'nextcloudToken']);
    let nextcloudBookmarks = [];
    
    if (config.nextcloudUrl && config.nextcloudUsername && config.nextcloudToken) {
      try {
        const api = new window.NextcloudBookmarksAPI(
          config.nextcloudUrl,
          config.nextcloudUsername,
          config.nextcloudToken
        );
        const ncBookmarks = await api.getAllBookmarks();
        nextcloudBookmarks = ncBookmarks.map(b => ({
          id: `nextcloud_${b.id}`,
          url: b.url,
          title: b.title,
          dateAdded: new Date((b.added || b.created_at) * 1000).getTime(), // added est en secondes UNIX
          lastModified: new Date((b.lastmodified || b.updated_at || b.added || b.created_at || 0) * 1000).getTime(),
          folder: b.folders && b.folders.length > 0 ? `Folder ${b.folders[0]}` : (b.folder ? b.folder.name : 'Racine'),
          tags: b.tags || [],
          description: b.description || '',
          source: 'nextcloud'
        }));
      } catch (error) {
        console.error('Erreur chargement Nextcloud:', error);
      }
    }

    // Met à jour les compteurs
    localCount.textContent = validFirefoxBookmarks.length;
    nextcloudCount.textContent = nextcloudBookmarks.length;

    // Détaille l'écart entre local et Nextcloud (par URL) pour comprendre d'où il vient :
    // marque-pages réellement absents d'un côté, vs. doublons d'URL côté Firefox
    // (plusieurs marque-pages Firefox pointant vers la même URL ne comptent que pour 1 côté Nextcloud).
    const diffStat = document.getElementById('bookmarks-diff-stat');
    const localUrlCounts = new Map();
    for (const b of validFirefoxBookmarks) {
      localUrlCounts.set(b.url, (localUrlCounts.get(b.url) || 0) + 1);
    }
    const nextcloudUrls = new Set(nextcloudBookmarks.map(b => b.url));

    const localDuplicates = [...localUrlCounts.values()].reduce((sum, n) => sum + (n > 1 ? n - 1 : 0), 0);
    const onlyLocal = [...localUrlCounts.keys()].filter(url => !nextcloudUrls.has(url)).length;
    const onlyNextcloud = nextcloudBookmarks.filter(b => !localUrlCounts.has(b.url)).length;

    const parts = [];
    if (onlyLocal > 0) parts.push(`${onlyLocal} uniquement local`);
    if (onlyNextcloud > 0) parts.push(`${onlyNextcloud} uniquement Nextcloud`);
    if (localDuplicates > 0) parts.push(`${localDuplicates} doublon(s) d'URL côté Firefox`);

    if (parts.length > 0) {
      diffStat.textContent = `⚠️ ${parts.join(', ')}`;
      diffStat.style.display = 'inline';
    } else {
      diffStat.style.display = 'none';
    }

    // Affiche les marque-pages
    displayBookmarks(validFirefoxBookmarks, nextcloudBookmarks);
    
  } catch (error) {
    bookmarksList.innerHTML = `<div class="error">Erreur: ${escapeHtml(error.message)}</div>`;
  }
}

// Favicon générique (SVG encodé en data URI, sans guillemets/# bruts) utilisée en dernier recours
const GENERIC_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#666" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-family="Arial">🌐</text></svg>'
);

// Génère une favicon par défaut à partir de l'URL
function getDefaultFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    // Couleurs basées sur le hash du domaine pour une apparence unique
    const hash = domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
      '#1abc9c', '#d35400', '#34495e', '#16a085', '#27ae60'
    ];
    const color = colors[hash % colors.length];
    const initial = domain.charAt(0).toUpperCase();

    // Génère un SVG avec la première lettre du domaine, encodé pour être utilisable
    // sans casser l'attribut HTML src (les guillemets/# bruts d'un SVG inline y sont interdits)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${color}" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-family="Arial">${initial}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  } catch (e) {
    return GENERIC_FAVICON;
  }
}

// ============================================
// Gestion du journal (Logs)
// ============================================

// Niveaux de log pour le filtre
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LOG_LEVEL_NAMES = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR'
};

const LOG_LEVEL_COLORS = {
  DEBUG: '#6c757d',
  INFO: '#007dff',
  WARN: '#ffc107',
  ERROR: '#dc3545'
};

// Charge les logs depuis le stockage
async function loadLogs() {
  const logsContainer = document.getElementById('logs-container');
  const logsCount = document.getElementById('logs-count');
  
  logsContainer.innerHTML = '<div class="loading">Chargement des logs...</div>';
  
  try {
    // Récupère les logs depuis le stockage
    const data = await browser.storage.local.get('syncLogs');
    const logs = data.syncLogs || [];
    
    // Met à jour le compteur
    logsCount.textContent = logs.length;
    
    if (logs.length === 0) {
      logsContainer.innerHTML = `
        <div class="empty-state">
          <span class="icon">📜</span>
          <p>Aucun log disponible</p>
          <p class="help-text">Activez les logs détaillés dans les paramètres avancés</p>
        </div>
      `;
      return;
    }
    
    // Affiche les logs
    displayLogs(logs);
    
    // Configure le filtre
    setupLogsFilter(logs);
    
  } catch (error) {
    logsContainer.innerHTML = `
      <div class="error">
        <span class="icon">⚠️</span>
        <p>Erreur de chargement des logs: ${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

// Affiche les logs
function displayLogs(logs) {
  const logsContainer = document.getElementById('logs-container');
  const filter = document.getElementById('logs-filter').value;
  
  // Filtre les logs si nécessaire
  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => LOG_LEVEL_NAMES[log.level] === filter);
  
  if (filteredLogs.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.innerHTML = '<span class="icon">🔍</span>';
    const p = document.createElement('p');
    p.textContent = 'Aucun log correspondant au filtre';
    emptyDiv.appendChild(p);
    logsContainer.innerHTML = '';
    logsContainer.appendChild(emptyDiv);
    return;
  }
  
  // Trie par timestamp (les plus récents en premier)
  const sortedLogs = [...filteredLogs].sort((a, b) => b.timestamp - a.timestamp);
  
  logsContainer.innerHTML = sortedLogs.map(log => {
    const date = new Date(log.timestamp);
    const timestamp = date.toLocaleString('fr-FR');
    const levelName = LOG_LEVEL_NAMES[log.level] || 'UNKNOWN';
    const levelClass = levelName.toLowerCase();
    
    // Formate le contexte
    let contextHtml = '';
    if (log.context && Object.keys(log.context).length > 0) {
      contextHtml = `<div class="context">${JSON.stringify(log.context).substring(0, 100)}</div>`;
    }
    
    return `
      <div class="log-entry" data-level="${levelName}">
        <span class="timestamp">${timestamp}</span>
        <span class="level ${levelClass}">${levelName}</span>
        <span class="message">${escapeHtml(log.message)}</span>
        ${contextHtml}
      </div>
    `;
  }).join('');
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
    showNotification(`Erreur lors de l\'effacement: ${error.message}`, 'error');
  }
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
    
    // Crée un fichier JSON
    const json = JSON.stringify(logs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nextcloud-bookmarks-sync-logs_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Logs exportés avec succès !', 'success');
    
  } catch (error) {
    showNotification(`Erreur lors de l\'export: ${error.message}`, 'error');
  }
}

// Affiche les marque-pages
function displayBookmarks(firefoxBookmarks, nextcloudBookmarks) {
  const bookmarksList = document.getElementById('bookmarks-list');
  const searchInput = document.getElementById('bookmarks-search');
  const sourceFilter = document.getElementById('bookmarks-source');
  
  // Fusionne et déduplique les marque-pages
  const allBookmarks = [];
  const urlSet = new Set();
  
  // Ajoute les marque-pages Firefox
  firefoxBookmarks.forEach(b => {
    if (!urlSet.has(b.url)) {
      urlSet.add(b.url);
      allBookmarks.push({
        id: `firefox_${b.id}`,
        url: b.url,
        title: b.title,
        favicon: b.faviconUrl || getDefaultFavicon(b.url),
        folder: b.parentId ? 'Dossier Firefox' : 'Racine',
        dateAdded: b.dateAdded,
        lastModified: b.dateLastUsed || b.dateAdded,
        tags: [],
        source: 'firefox'
      });
    }
  });
  
  // Ajoute les marque-pages Nextcloud
  nextcloudBookmarks.forEach(b => {
    if (!urlSet.has(b.url)) {
      urlSet.add(b.url);
      allBookmarks.push(b);
    }
  });
  
  // Trie par titre
  allBookmarks.sort((a, b) => a.title.localeCompare(b.title));
  
  // Filtre et affiche
  function renderBookmarks(bookmarks) {
    if (bookmarks.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.innerHTML = '<span class="icon">🔍</span>';
      const p = document.createElement('p');
      p.textContent = 'Aucun marque-page trouvé';
      emptyDiv.appendChild(p);
      bookmarksList.innerHTML = '';
      bookmarksList.appendChild(emptyDiv);
      return;
    }
    
    bookmarksList.innerHTML = bookmarks.map(bookmark => `
      <div class="bookmark-item" data-url="${bookmark.url}" data-source="${bookmark.source}">
        <img src="${escapeHtml(bookmark.favicon || getDefaultFavicon(bookmark.url))}" alt="" class="favicon" width="16" height="16" loading="lazy" onerror="this.onerror=null;this.src='${GENERIC_FAVICON}'">
        <div class="info">
          <div class="title">${escapeHtml(bookmark.title)}</div>
          <div class="url">${escapeHtml(bookmark.url)}</div>
          <div class="meta">
            <span class="source ${bookmark.source}">${bookmark.source === 'firefox' ? 'Firefox' : 'Nextcloud'}</span>
            <span class="folder">${escapeHtml(bookmark.folder)}</span>
          </div>
          ${bookmark.tags.length > 0 ? `
            <div class="tags">
              ${bookmark.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="actions">
          <button class="btn-icon" title="Ouvrir">🔗</button>
          <button class="btn-icon" title="Copier l'URL">📋</button>
        </div>
      </div>
    `).join('');
    
    // Ajoute les écouteurs d'événements
    document.querySelectorAll('.bookmark-item .actions .btn-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const bookmarkItem = e.target.closest('.bookmark-item');
        const url = bookmarkItem.dataset.url;
        const action = e.target.textContent;
        
        if (action === '🔗') {
          // Ouvre l'URL
          browser.tabs.create({ url });
        } else if (action === '📋') {
          // Copie l'URL
          navigator.clipboard.writeText(url).then(() => {
            showNotification('URL copiée dans le presse-papiers !', 'success');
          });
        }
      });
    });
  }
  
  // Applique le filtre initial
  renderBookmarks(allBookmarks);
  
  // Écoute les changements de filtre
  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const sourceFilterValue = sourceFilter.value;
    
    const filtered = allBookmarks.filter(b => {
      const matchesSearch = b.title.toLowerCase().includes(searchTerm) || 
                           b.url.toLowerCase().includes(searchTerm);
      const matchesSource = sourceFilterValue === 'all' || b.source === sourceFilterValue;
      return matchesSearch && matchesSource;
    });
    
    renderBookmarks(filtered);
  });
  
  sourceFilter.addEventListener('change', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const sourceFilterValue = sourceFilter.value;
    
    const filtered = allBookmarks.filter(b => {
      const matchesSearch = b.title.toLowerCase().includes(searchTerm) || 
                           b.url.toLowerCase().includes(searchTerm);
      const matchesSource = sourceFilterValue === 'all' || b.source === sourceFilterValue;
      return matchesSearch && matchesSource;
    });
    
    renderBookmarks(filtered);
  });
}

// ============================================
// Actions dangereuses
// ============================================

// Réinitialise les paramètres
async function resetSettings() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres ?')) {
    return;
  }
  
  await browser.storage.local.clear();
  location.reload();
}

// Efface le cache
async function clearCache() {
  if (!confirm('Êtes-vous sûr de vouloir effacer le cache local ?')) {
    return;
  }
  
  await browser.storage.local.remove(['lastSync', 'lastConflicts', 'syncLogs']);
  showNotification('Cache effacé avec succès !', 'success');
}

// ============================================
// Export des marque-pages
// ============================================

async function exportBookmarks() {
  const config = await browser.storage.local.get(['nextcloudUrl', 'nextcloudUsername', 'nextcloudToken']);
  
  if (!config.nextcloudUrl || !config.nextcloudUsername || !config.nextcloudToken) {
    showNotification('Veuillez configurer Nextcloud d\'abord', 'error');
    return;
  }
  
  try {
    const api = new window.NextcloudBookmarksAPI(
      config.nextcloudUrl,
      config.nextcloudUsername,
      config.nextcloudToken
    );
    
    const bookmarks = await api.getAllBookmarks();
    
    // Crée un fichier HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Marque-pages exportés</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .bookmark { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
          .bookmark a { color: #0066cc; text-decoration: none; }
          .bookmark a:hover { text-decoration: underline; }
          .tags { color: #666; font-size: 12px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <h1>Marque-pages exportés (${bookmarks.length})</h1>
        <p>Exportés depuis Nextcloud le ${new Date().toLocaleString('fr-FR')}</p>
        ${bookmarks.map(b => `
          <div class="bookmark">
            <div><a href="${b.url}" target="_blank">${b.title}</a></div>
            <div class="tags">${b.tags ? b.tags.join(', ') : ''} | ${b.folders && b.folders.length > 0 ? `Folder ${b.folders[0]}` : (b.folder ? b.folder.name : 'Racine')}</div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
    
    // Télécharge le fichier
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks_export_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Marque-pages exportés avec succès !', 'success');
    
  } catch (error) {
    showNotification(`Erreur lors de l'export: ${error.message}`, 'error');
  }
}

// ============================================
// Écouteurs d'événements
// ============================================

function setupEventListeners() {
  // Sauvegarde des paramètres
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  
  // Test de connexion
  document.getElementById('test-connection').addEventListener('click', testConnection);
  
  // Charger les marque-pages
  document.getElementById('load-bookmarks').addEventListener('click', loadBookmarks);
  document.getElementById('refresh-bookmarks').addEventListener('click', loadBookmarks);
  
  // Export des marque-pages
  document.getElementById('export-bookmarks').addEventListener('click', exportBookmarks);
  
  // Gestion des logs
  document.getElementById('refresh-logs').addEventListener('click', refreshLogs);
  document.getElementById('clear-logs').addEventListener('click', clearLogs);
  document.getElementById('export-logs').addEventListener('click', exportLogs);
  
  // Afficher/masquer le token
  document.getElementById('show-token').addEventListener('click', () => {
    const tokenInput = document.getElementById('nextcloud-token');
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      document.getElementById('show-token').textContent = '🙈';
    } else {
      tokenInput.type = 'password';
      document.getElementById('show-token').textContent = '👁️';
    }
  });
  
  // Actions dangereuses
  document.getElementById('reset-settings').addEventListener('click', resetSettings);
  document.getElementById('clear-cache').addEventListener('click', clearCache);
  
  // Fermer la page
  document.getElementById('close-options').addEventListener('click', () => {
    window.close();
  });
}

// ============================================
// Utilitaires
// ============================================

// Affiche une notification
function showNotification(message, type = 'info') {
  // Crée une notification temporaire
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Style de base
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007dff'};
  `;
  
  document.body.appendChild(notification);
  
  // Animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // Supprime après 3 secondes
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 300);
  }, 3000);
}

// Échappe les caractères HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// NextcloudBookmarksAPI est chargé via ../background/nextcloud_api.js dans options.html
