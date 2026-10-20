// ============================================
// Page des options - Paramètres, thème, test de connexion
// ============================================

// [clé de stockage, id du champ, type, valeur par défaut]
const SETTING_FIELDS = [
  ['nextcloudUrl', 'nextcloud-url', 'text', ''],
  ['nextcloudUsername', 'nextcloud-username', 'text', ''],
  ['nextcloudToken', 'nextcloud-token', 'text', ''],
  ['syncInterval', 'sync-interval', 'number', 5],
  ['autoSync', 'auto-sync', 'checkbox', true],
  ['syncOnStartup', 'sync-on-startup', 'checkbox', false],
  ['resolveConflictsAuto', 'resolve-conflicts-auto', 'checkbox', false],
  ['maxLogEntries', 'max-log-entries', 'number', 50],
  ['enableLogs', 'enable-logs', 'checkbox', false],
  ['enableBatchProcessing', 'enable-batch-processing', 'checkbox', true],
  ['cacheTtl', 'cache-ttl', 'number', 10],
  ['batchSize', 'batch-size', 'number', 50],
  ['darkMode', 'dark-mode', 'checkbox', false]
];

// Une case cochée par défaut ne se décoche que sur un `false` explicite
function checkboxValue(stored, defaultValue) {
  return defaultValue ? stored !== false : !!stored;
}

// Charge les paramètres depuis le stockage
async function loadSettings() {
  const settings = await browser.storage.local.get(SETTING_FIELDS.map(([key]) => key));

  for (const [key, id, type, defaultValue] of SETTING_FIELDS) {
    const field = document.getElementById(id);
    if (type === 'checkbox') {
      field.checked = checkboxValue(settings[key], defaultValue);
    } else {
      field.value = settings[key] || defaultValue;
    }
  }

  applyTheme(settings.darkMode || false);
}

function readSettingField(id, type, defaultValue) {
  const field = document.getElementById(id);
  if (type === 'checkbox') return field.checked;
  if (type === 'number') return parseInt(field.value) || defaultValue;
  return field.value.trim();
}

// Sauvegarde les paramètres
async function saveSettings() {
  const settings = Object.fromEntries(SETTING_FIELDS.map(([key, id, type, defaultValue]) =>
    [key, readSettingField(id, type, defaultValue)]));

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

function showConnectionStatus(text, state) {
  const statusElement = document.getElementById('connection-status');
  statusElement.textContent = text;
  statusElement.className = state ? `connection-status ${state}` : 'connection-status';
  statusElement.style.display = 'block';
}

async function testConnection() {
  const url = document.getElementById('nextcloud-url').value.trim();
  const username = document.getElementById('nextcloud-username').value.trim();
  const token = document.getElementById('nextcloud-token').value.trim();

  if (!url || !username || !token) {
    showNotification('Veuillez remplir tous les champs', 'error');
    return;
  }

  showConnectionStatus('Test en cours...', '');
  try {
    // Crée une instance temporaire de l'API
    const api = new window.NextcloudBookmarksAPI(url, username, token);
    const result = await api.testConnection();

    if (result.connected) {
      showConnectionStatus('✅ Connexion réussie !', 'connected');
      showNotification('Connexion à Nextcloud: Succès', 'success');
    } else {
      showConnectionStatus(`❌ ${result.message}`, 'error');
      showNotification(`Connexion échouée: ${result.message}`, 'error');
    }
  } catch (error) {
    showConnectionStatus(`❌ ${error.message}`, 'error');
    showNotification(`Erreur: ${error.message}`, 'error');
  }
}
