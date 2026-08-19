// ============================================
// Logger centralisé pour l'extension
// ============================================

/**
 * Niveaux de log
 */
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * Configuration du logger
 */
const loggerConfig = {
  level: LOG_LEVELS.INFO, // Niveau minimum à logger
  enabled: true, // Active/désactive complètement le logging
  prefix: '[NC-BOOKMARKS-SYNC]',
  maxEntries: 100, // Nombre maximum d'entrées dans l'historique
  history: [] // Historique des logs
};

/**
 * Initialise le logger avec la configuration depuis le stockage
 */
async function initLogger() {
  try {
    const settings = await browser.storage.local.get(['enableLogs', 'maxLogEntries']);
    loggerConfig.enabled = settings.enableLogs !== false;
    loggerConfig.maxEntries = settings.maxLogEntries || 100;
    
    // Charger l'historique existant
    const storedLogs = await browser.storage.local.get('syncLogs');
    if (storedLogs.syncLogs) {
      loggerConfig.history = storedLogs.syncLogs.slice(-loggerConfig.maxEntries);
    }
  } catch (error) {
    console.error('Erreur initialisation logger:', error);
  }
}

/**
 * Sauvegarde l'historique dans le stockage
 */
async function saveLogHistory() {
  try {
    await browser.storage.local.set({ syncLogs: loggerConfig.history });
  } catch (error) {
    console.error('Erreur sauvegarde historique logs:', error);
  }
}

/**
 * Ajoute une entrée à l'historique
 */
function addToHistory(level, message, context = {}) {
  const entry = {
    timestamp: Date.now(),
    level,
    message,
    context
  };
  
  loggerConfig.history.push(entry);
  
  // Limite la taille de l'historique
  if (loggerConfig.history.length > loggerConfig.maxEntries) {
    loggerConfig.history.shift();
  }
  
  // Sauvegarde périodiquement (pas à chaque ajout pour les performances)
  if (loggerConfig.history.length % 10 === 0) {
    saveLogHistory().catch(() => {});
  }
}

/**
 * Récupère l'historique des logs
 */
function getLogHistory() {
  return loggerConfig.history;
}

/**
 * Efface l'historique des logs
 */
async function clearLogHistory() {
  loggerConfig.history = [];
  await browser.storage.local.remove('syncLogs');
}

/**
 * Formate un message de log avec le préfixe
 */
function formatMessage(message) {
  return `${loggerConfig.prefix} ${new Date().toISOString()} - ${message}`;
}

/**
 * Log au niveau DEBUG
 */
function debug(message, context = {}) {
  if (!loggerConfig.enabled || loggerConfig.level > LOG_LEVELS.DEBUG) return;
  
  const formatted = formatMessage(`[DEBUG] ${message}`);
  console.debug(formatted, context);
  addToHistory(LOG_LEVELS.DEBUG, message, context);
}

/**
 * Log au niveau INFO
 */
function info(message, context = {}) {
  if (!loggerConfig.enabled || loggerConfig.level > LOG_LEVELS.INFO) return;
  
  const formatted = formatMessage(`[INFO] ${message}`);
  console.info(formatted, context);
  addToHistory(LOG_LEVELS.INFO, message, context);
}

/**
 * Log au niveau WARN
 */
function warn(message, context = {}) {
  if (!loggerConfig.enabled || loggerConfig.level > LOG_LEVELS.WARN) return;
  
  const formatted = formatMessage(`[WARN] ${message}`);
  console.warn(formatted, context);
  addToHistory(LOG_LEVELS.WARN, message, context);
}

/**
 * Log au niveau ERROR
 */
function error(message, context = {}) {
  if (!loggerConfig.enabled || loggerConfig.level > LOG_LEVELS.ERROR) return;
  
  const formatted = formatMessage(`[ERROR] ${message}`);
  console.error(formatted, context);
  addToHistory(LOG_LEVELS.ERROR, message, context);
}

/**
 * Définir le niveau de log
 */
function setLogLevel(level) {
  const levelUpper = level.toUpperCase();
  if (LOG_LEVELS[levelUpper] !== undefined) {
    loggerConfig.level = LOG_LEVELS[levelUpper];
  }
}

/**
 * Activer/désactiver le logger
 */
function setEnabled(enabled) {
  loggerConfig.enabled = enabled;
}

// ============================================
// Export global
// ============================================

exposeGlobal('NCBookmarksLogger', {
  LOG_LEVELS,
  initLogger,
  getLogHistory,
  clearLogHistory,
  debug,
  info,
  warn,
  error,
  setLogLevel,
  setEnabled
});
