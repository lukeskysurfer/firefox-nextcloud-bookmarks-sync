// ============================================
// Gestion centralisée des erreurs
// ============================================

/**
 * Types d'erreurs
 */
const ERROR_TYPES = {
  CONNECTION: 'CONNECTION_ERROR',
  AUTH: 'AUTHENTICATION_ERROR',
  API: 'API_ERROR',
  SYNC: 'SYNC_ERROR',
  STORAGE: 'STORAGE_ERROR',
  CONFLICT: 'CONFLICT_ERROR',
  NETWORK: 'NETWORK_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * Classe d'erreur personnalisée
 */
class SyncError extends Error {
  constructor(message, type = ERROR_TYPES.UNKNOWN, context = {}, isRetryable = false) {
    super(message);
    this.name = 'SyncError';
    this.type = type;
    this.context = context;
    this.isRetryable = isRetryable;
    this.timestamp = Date.now();
    
    // Capture la stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SyncError);
    }
  }
  
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      context: this.context,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Vérifie si c'est une erreur réseau
 */
function isNetworkError(error) {
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || '';
  const networkErrors = [
    'network',
    'fetch',
    'timeout',
    'offline',
    'connection',
    'etimedout',
    'econnreset',
    'econnrefused',
    'enotfound',
    'dns'
  ];
  
  return networkErrors.some(term => message.includes(term)) ||
         error.name === 'TypeError' && message.includes('failed to fetch');
}

/**
 * Crée une erreur à partir d'une erreur standard
 */
function createError(error, type = ERROR_TYPES.UNKNOWN, context = {}) {
  if (error instanceof SyncError) {
    return error;
  }
  
  const message = error.message || String(error);
  const isRetryable = isNetworkError(error);
  
  return new SyncError(message, type, context, isRetryable);
}

/**
 * Vérifie si une erreur est récupérable (réseau, timeout, etc.)
 */
function isRetryableError(error) {
  if (error instanceof SyncError) {
    return error.isRetryable;
  }
  return isNetworkError(error);
}

/**
 * Gère une erreur et la log
 */
function handleError(error, context = {}, logger = console) {
  const syncError = createError(error, ERROR_TYPES.UNKNOWN, context);
  
  // Log l'erreur
  logger.error(`[${syncError.type}] ${syncError.message}`, {
    context: syncError.context,
    stack: syncError.stack
  });
  
  return syncError;
}

/**
 * Messages d'erreur utilisateur
 */
const USER_MESSAGES = {
  [ERROR_TYPES.CONNECTION]: 'Impossible de se connecter à Nextcloud. Vérifiez votre connexion internet.',
  [ERROR_TYPES.AUTH]: 'Échec de l\'authentification. Vérifiez votre token et votre nom d\'utilisateur.',
  [ERROR_TYPES.API]: 'Erreur de l\'API Nextcloud. Votre serveur peut être dans une version non supportée.',
  [ERROR_TYPES.SYNC]: 'Erreur de synchronisation. Veuillez réessayer.',
  [ERROR_TYPES.STORAGE]: 'Erreur de stockage local. Vérifiez les permissions.',
  [ERROR_TYPES.CONFLICT]: 'Conflit détecté entre les versions locale et distante.',
  [ERROR_TYPES.NETWORK]: 'Problème de réseau. Vérifiez votre connexion.',
  [ERROR_TYPES.VALIDATION]: 'Données invalides. Vérifiez votre configuration.',
  [ERROR_TYPES.UNKNOWN]: 'Une erreur inattendue est survenue.'
};

/**
 * Récupère un message utilisateur pour une erreur
 */
function getUserMessage(error) {
  if (error instanceof SyncError) {
    return USER_MESSAGES[error.type] || USER_MESSAGES[ERROR_TYPES.UNKNOWN];
  }
  return USER_MESSAGES[ERROR_TYPES.UNKNOWN];
}

// ============================================
// Export global
// ============================================

// Détermine la portée globale
const globalScope = (typeof self !== 'undefined') ? self : 
                   (typeof window !== 'undefined') ? window : 
                   (typeof global !== 'undefined') ? global : 
                   {};

// Expose globalement pour la compatibilité
globalScope.NCBookmarksErrors = {
  ERROR_TYPES,
  SyncError,
  createError,
  isRetryableError,
  handleError,
  USER_MESSAGES,
  getUserMessage
};

console.log('[NC-BOOKMARKS-SYNC] NCBookmarksErrors exposée dans:', typeof self !== 'undefined' ? 'self' : typeof window !== 'undefined' ? 'window' : 'global');
