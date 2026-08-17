// ============================================
// Configuration centralisée de l'extension
// ============================================

/**
 * Configuration par défaut
 */
const DEFAULT_CONFIG = {
  nextcloudUrl: '',
  nextcloudUsername: '',
  nextcloudToken: '',
  syncInterval: 5,
  autoSync: true,
  syncOnStartup: false,
  resolveConflictsAuto: false,
  maxLogEntries: 50,
  enableLogs: false
};

/**
 * Cache de la configuration chargée
 */
let configCache = null;
let lastConfigLoad = 0;
const CONFIG_CACHE_TTL = 30000; // 30 secondes

/**
 * Charge la configuration depuis le stockage
 * Utilise un cache pour éviter les lectures trop fréquentes
 */
async function loadConfig(forceRefresh = false) {
  const now = Date.now();
  
  // Retourne le cache s'il est valide
  if (!forceRefresh && configCache && (now - lastConfigLoad) < CONFIG_CACHE_TTL) {
    return configCache;
  }
  
  try {
    const stored = await browser.storage.local.get([
      'nextcloudUrl',
      'nextcloudUsername',
      'nextcloudToken',
      'syncInterval',
      'autoSync',
      'syncOnStartup',
      'resolveConflictsAuto',
      'maxLogEntries',
      'enableLogs'
    ]);
    
    // Fusionne avec les valeurs par défaut
    configCache = {
      nextcloudUrl: stored.nextcloudUrl || DEFAULT_CONFIG.nextcloudUrl,
      nextcloudUsername: stored.nextcloudUsername || DEFAULT_CONFIG.nextcloudUsername,
      nextcloudToken: stored.nextcloudToken || DEFAULT_CONFIG.nextcloudToken,
      syncInterval: stored.syncInterval !== undefined ? stored.syncInterval : DEFAULT_CONFIG.syncInterval,
      autoSync: stored.autoSync !== undefined ? stored.autoSync : DEFAULT_CONFIG.autoSync,
      syncOnStartup: stored.syncOnStartup !== undefined ? stored.syncOnStartup : DEFAULT_CONFIG.syncOnStartup,
      resolveConflictsAuto: stored.resolveConflictsAuto !== undefined ? stored.resolveConflictsAuto : DEFAULT_CONFIG.resolveConflictsAuto,
      maxLogEntries: stored.maxLogEntries !== undefined ? stored.maxLogEntries : DEFAULT_CONFIG.maxLogEntries,
      enableLogs: stored.enableLogs !== undefined ? stored.enableLogs : DEFAULT_CONFIG.enableLogs
    };
    
    lastConfigLoad = now;
    return configCache;
  } catch (error) {
    NCBookmarksLogger?.error('Erreur chargement configuration:', { error: error.message });
    // Retourne la config par défaut en cas d'erreur
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Sauvegarde la configuration
 */
async function saveConfig(partialConfig) {
  try {
    await browser.storage.local.set(partialConfig);
    
    // Met à jour le cache
    configCache = {
      ...configCache,
      ...partialConfig
    };
    lastConfigLoad = Date.now();
    
    NCBookmarksLogger?.info('Configuration sauvegardée');
  } catch (error) {
    NCBookmarksLogger?.error('Erreur sauvegarde configuration:', { error: error.message });
    throw error;
  }
}

/**
 * Vérifie si la configuration est complète
 */
function isConfigComplete(config = configCache) {
  if (!config) return false;
  return !!(config.nextcloudUrl && config.nextcloudUsername && config.nextcloudToken);
}

/**
 * Efface la configuration
 */
async function clearConfig() {
  try {
    await browser.storage.local.clear();
    configCache = null;
    lastConfigLoad = 0;
    NCBookmarksLogger?.info('Configuration effacée');
  } catch (error) {
    NCBookmarksLogger?.error('Erreur effacement configuration:', { error: error.message });
    throw error;
  }
}

/**
 * Écoute les changements de configuration
 */
function onConfigChange(callback) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // Invalide le cache si des clés de config changent
      const configKeys = [
        'nextcloudUrl', 'nextcloudUsername', 'nextcloudToken',
        'syncInterval', 'autoSync', 'syncOnStartup',
        'resolveConflictsAuto', 'maxLogEntries', 'enableLogs'
      ];
      
      const hasConfigChange = configKeys.some(key => changes[key]);
      if (hasConfigChange) {
        configCache = null; // Invalide le cache
        callback(changes);
      }
    }
  });
}

// Expose les fonctions globalement
window.NCBookmarksConfig = {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  isConfigComplete,
  clearConfig,
  onConfigChange,
  get configCache() { return configCache; }
};
