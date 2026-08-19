// ============================================
// Cache Manager - Gestion du cache local des marque-pages
// ============================================

/**
 * Clé de stockage pour le cache
 */
const CACHE_KEYS = {
  FIREFOX_BOOKMARKS: 'cache_firefox_bookmarks',
  NEXTCLOUD_BOOKMARKS: 'cache_nextcloud_bookmarks',
  FIREFOX_TIMESTAMP: 'cache_firefox_timestamp',
  NEXTCLOUD_TIMESTAMP: 'cache_nextcloud_timestamp',
  LAST_FULL_SYNC: 'cache_last_full_sync'
};

/**
 * TTL du cache en millisecondes (10 minutes par défaut, configurable)
 */
let CACHE_TTL = 10 * 60 * 1000;

/**
 * Met à jour le TTL du cache à partir des paramètres
 */
async function updateCacheTtl() {
  try {
    const settings = await browser.storage.local.get('cacheTtl');
    if (settings.cacheTtl) {
      CACHE_TTL = parseInt(settings.cacheTtl) * 60 * 1000; // Convertir minutes en ms
      NCBookmarksLogger?.info(`TTL du cache mis à jour: ${settings.cacheTtl} minutes (${CACHE_TTL}ms)`);
    }
  } catch (error) {
    NCBookmarksLogger?.error('Erreur mise à jour TTL cache:', { error: error.message });
  }
}

/**
 * Taille maximale du cache
 */
const MAX_CACHE_SIZE = 10000;

/**
 * Récupère le cache des marque-pages Firefox
 */
async function getFirefoxBookmarksCache() {
  try {
    const result = await browser.storage.local.get([
      CACHE_KEYS.FIREFOX_BOOKMARKS,
      CACHE_KEYS.FIREFOX_TIMESTAMP
    ]);
    
    // Vérifie si le cache est valide (moins de TTL vieux)
    if (result[CACHE_KEYS.FIREFOX_BOOKMARKS] && result[CACHE_KEYS.FIREFOX_TIMESTAMP]) {
      const cacheTime = parseInt(result[CACHE_KEYS.FIREFOX_TIMESTAMP]);
      const now = Date.now();
      
      if ((now - cacheTime) < CACHE_TTL) {
        NCBookmarksLogger?.debug('Cache Firefox valide', { age: `${Math.round((now - cacheTime)/1000)}s` });
        return result[CACHE_KEYS.FIREFOX_BOOKMARKS];
      }
    }
    
    NCBookmarksLogger?.debug('Cache Firefox expiré ou absent');
    return null;
  } catch (error) {
    NCBookmarksLogger?.error('Erreur lecture cache Firefox:', { error: error.message });
    return null;
  }
}

/**
 * Sauvegarde le cache des marque-pages Firefox
 */
async function saveFirefoxBookmarksCache(bookmarks, timestamp = Date.now()) {
  try {
    // Limite la taille du cache
    const limitedBookmarks = bookmarks.slice(0, MAX_CACHE_SIZE);
    
    await browser.storage.local.set({
      [CACHE_KEYS.FIREFOX_BOOKMARKS]: limitedBookmarks,
      [CACHE_KEYS.FIREFOX_TIMESTAMP]: timestamp
    });
    
    NCBookmarksLogger?.debug(`Cache Firefox sauvegardé (${limitedBookmarks.length} bookmarks)`);
  } catch (error) {
    NCBookmarksLogger?.error('Erreur sauvegarde cache Firefox:', { error: error.message });
  }
}

/**
 * Récupère le cache des marque-pages Nextcloud
 */
async function getNextcloudBookmarksCache() {
  try {
    const result = await browser.storage.local.get([
      CACHE_KEYS.NEXTCLOUD_BOOKMARKS,
      CACHE_KEYS.NEXTCLOUD_TIMESTAMP
    ]);
    
    // Vérifie si le cache est valide
    if (result[CACHE_KEYS.NEXTCLOUD_BOOKMARKS] && result[CACHE_KEYS.NEXTCLOUD_TIMESTAMP]) {
      const cacheTime = parseInt(result[CACHE_KEYS.NEXTCLOUD_TIMESTAMP]);
      const now = Date.now();
      
      if ((now - cacheTime) < CACHE_TTL) {
        NCBookmarksLogger?.debug('Cache Nextcloud valide', { age: `${Math.round((now - cacheTime)/1000)}s` });
        return result[CACHE_KEYS.NEXTCLOUD_BOOKMARKS];
      }
    }
    
    NCBookmarksLogger?.debug('Cache Nextcloud expiré ou absent');
    return null;
  } catch (error) {
    NCBookmarksLogger?.error('Erreur lecture cache Nextcloud:', { error: error.message });
    return null;
  }
}

/**
 * Sauvegarde le cache des marque-pages Nextcloud
 */
async function saveNextcloudBookmarksCache(bookmarks, timestamp = Date.now()) {
  try {
    // Limite la taille du cache
    const limitedBookmarks = bookmarks.slice(0, MAX_CACHE_SIZE);
    
    await browser.storage.local.set({
      [CACHE_KEYS.NEXTCLOUD_BOOKMARKS]: limitedBookmarks,
      [CACHE_KEYS.NEXTCLOUD_TIMESTAMP]: timestamp
    });
    
    NCBookmarksLogger?.debug(`Cache Nextcloud sauvegardé (${limitedBookmarks.length} bookmarks)`);
  } catch (error) {
    NCBookmarksLogger?.error('Erreur sauvegarde cache Nextcloud:', { error: error.message });
  }
}

/**
 * Efface le cache des marque-pages
 */
async function clearBookmarksCache() {
  try {
    await browser.storage.local.remove([
      CACHE_KEYS.FIREFOX_BOOKMARKS,
      CACHE_KEYS.NEXTCLOUD_BOOKMARKS,
      CACHE_KEYS.FIREFOX_TIMESTAMP,
      CACHE_KEYS.NEXTCLOUD_TIMESTAMP
    ]);
    NCBookmarksLogger?.info('Cache des marque-pages effacé');
  } catch (error) {
    NCBookmarksLogger?.error('Erreur effacement cache:', { error: error.message });
  }
}

/**
 * Vérifie si une synchronisation complète a déjà été faite
 */
async function getLastFullSyncTimestamp() {
  try {
    const result = await browser.storage.local.get(CACHE_KEYS.LAST_FULL_SYNC);
    return result[CACHE_KEYS.LAST_FULL_SYNC] ? parseInt(result[CACHE_KEYS.LAST_FULL_SYNC]) : 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Met à jour le timestamp de la dernière synchronisation complète
 */
async function updateLastFullSyncTimestamp() {
  try {
    await browser.storage.local.set({
      [CACHE_KEYS.LAST_FULL_SYNC]: Date.now()
    });
  } catch (error) {
    NCBookmarksLogger?.error('Erreur mise à jour timestamp sync:', { error: error.message });
  }
}

/**
 * Détermine si on peut utiliser le cache (synchronisation incrémentale)
 * Retourne true si le cache est frais et qu'une sync complète a été faite récemment
 */
async function canUseCache() {
  const lastFullSync = await getLastFullSyncTimestamp();
  const now = Date.now();
  
  // On peut utiliser le cache si une sync complète a été faite dans les dernières 24h
  const cacheValid = (now - lastFullSync) < (24 * 60 * 60 * 1000);
  
  NCBookmarksLogger?.debug(`Can use cache: ${cacheValid} (last full sync: ${new Date(lastFullSync).toLocaleString()})`);
  return cacheValid;
}

// ============================================
// Cache des Favicons
// ============================================

/**
 * Récupère le favicon d'un bookmark depuis le cache
 */
async function getFaviconCache(bookmarkId) {
  try {
    const result = await browser.storage.local.get(`favicon_${bookmarkId}`);
    if (result[`favicon_${bookmarkId}`]) {
      NCBookmarksLogger?.debug(`Favicon cache hit: ${bookmarkId}`);
      return result[`favicon_${bookmarkId}`];
    }
    return null;
  } catch (error) {
    NCBookmarksLogger?.error('Erreur lecture cache favicon:', { error: error.message, bookmarkId });
    return null;
  }
}

/**
 * Sauvegarde le favicon d'un bookmark dans le cache
 */
async function saveFaviconCache(bookmarkId, faviconData) {
  try {
    if (!faviconData) return;
    await browser.storage.local.set({
      [`favicon_${bookmarkId}`]: faviconData
    });
    NCBookmarksLogger?.debug(`Favicon cache saved: ${bookmarkId}`);
  } catch (error) {
    NCBookmarksLogger?.error('Erreur sauvegarde cache favicon:', { error: error.message, bookmarkId });
  }
}

/**
 * Récupère plusieurs favicons depuis le cache
 */
async function getMultipleFaviconsCache(bookmarkIds) {
  try {
    const result = await browser.storage.local.get(bookmarkIds.map(id => `favicon_${id}`));
    const cached = {};
    for (const id of bookmarkIds) {
      if (result[`favicon_${id}`]) {
        cached[id] = result[`favicon_${id}`];
      }
    }
    return cached;
  } catch (error) {
    NCBookmarksLogger?.error('Erreur lecture multiple cache favicons:', { error: error.message });
    return {};
  }
}

/**
 * Efface le cache des favicons pour des bookmarks spécifiques
 */
async function clearFaviconsCache(bookmarkIds) {
  try {
    const keysToRemove = bookmarkIds.map(id => `favicon_${id}`);
    await browser.storage.local.remove(keysToRemove);
    NCBookmarksLogger?.debug(`Favicons cache cleared for ${bookmarkIds.length} bookmarks`);
  } catch (error) {
    NCBookmarksLogger?.error('Erreur effacement cache favicons:', { error: error.message });
  }
}

// ============================================
// Export global
// ============================================

// Détermine la portée globale
const globalScope = (typeof self !== 'undefined') ? self : 
                   (typeof window !== 'undefined') ? window : 
                   (typeof global !== 'undefined') ? global : 
                   {};

// Expose les fonctions globalement
globalScope.NCBookmarksCache = {
  CACHE_KEYS,
  CACHE_TTL,
  MAX_CACHE_SIZE,
  getFirefoxBookmarksCache,
  saveFirefoxBookmarksCache,
  getNextcloudBookmarksCache,
  saveNextcloudBookmarksCache,
  clearBookmarksCache,
  getLastFullSyncTimestamp,
  updateLastFullSyncTimestamp,
  canUseCache,
  getFaviconCache,
  saveFaviconCache,
  getMultipleFaviconsCache,
  clearFaviconsCache
};

console.log('[NC-BOOKMARKS-SYNC] NCBookmarksCache exposée dans:', typeof self !== 'undefined' ? 'self' : typeof window !== 'undefined' ? 'window' : 'global');
