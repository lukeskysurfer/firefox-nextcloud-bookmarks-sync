// ============================================
// Background Script - Synchronisation principale
// ============================================

// État global
let nextcloudAPI = null;
let syncInProgress = false;
let conflicts = [];

// Correspondance persistante entre dossiers Firefox et dossiers Nextcloud
// { ff2nc: { <firefoxFolderId>: <nextcloudFolderId|null> }, nc2ff: { <nextcloudFolderId>: <firefoxFolderId> } }
let folderMapping = { ff2nc: {}, nc2ff: {} };
// Titres des dossiers Nextcloud (uniquement pour l'affichage)
let ncFolderTitles = {};

// Initialisation explicite pour éviter les problèmes de timing
try {
  if (typeof initLogger === 'function') {
    initLogger().catch(err => console.error('Erreur initLogger:', err));
  }
} catch (e) {
  console.error('Erreur appel initLogger:', e);
}

// ============================================
// Configuration
// ============================================

// Charge la configuration depuis le stockage
async function loadConfig() {
  const config = await browser.storage.local.get([
    'nextcloudUrl',
    'nextcloudUsername',
    'nextcloudToken',
    'syncInterval',
    'autoSync'
  ]);

  const defaults = {
    nextcloudUrl: '',
    nextcloudUsername: '',
    nextcloudToken: '',
    syncInterval: 5,
    autoSync: true
  };

  return {
    nextcloudUrl: config.nextcloudUrl || defaults.nextcloudUrl,
    nextcloudUsername: config.nextcloudUsername || defaults.nextcloudUsername,
    nextcloudToken: config.nextcloudToken || defaults.nextcloudToken,
    syncInterval: config.syncInterval || defaults.syncInterval,
    autoSync: config.autoSync !== false && defaults.autoSync
  };
}

// Initialise l'API Nextcloud
async function initNextcloudAPI() {
  const config = await loadConfig();
  if (config.nextcloudUrl && config.nextcloudUsername && config.nextcloudToken) {
    // Utiliser self.NextcloudBookmarksAPI pour être compatible avec les background scripts
    // où window n'existe pas
    const APIClass = (typeof self !== 'undefined' && self.NextcloudBookmarksAPI) ?
                     self.NextcloudBookmarksAPI :
                     (typeof window !== 'undefined' && window.NextcloudBookmarksAPI) ?
                     window.NextcloudBookmarksAPI :
                     NextcloudBookmarksAPI;

    nextcloudAPI = new APIClass(
      config.nextcloudUrl,
      config.nextcloudUsername,
      config.nextcloudToken
    );
    return true;
  }
  return false;
}

// ============================================
// Synchronisation complète
// ============================================

// Charge les marques-pages des deux côtés, depuis le cache s'il est complet
async function loadBookmarks(useCache) {
  if (useCache) {
    const [cachedLocal, cachedRemote] = await Promise.all([
      NCBookmarksCache.getFirefoxBookmarksCache(),
      NCBookmarksCache.getNextcloudBookmarksCache()
    ]);
    if (cachedLocal && cachedRemote) {
      NCBookmarksLogger.info('Utilisation du cache pour la synchronisation');
      sendSyncProgress('cache_used', `Cache utilisé (${cachedLocal.length} local, ${cachedRemote.length} distant)`, 20);
      return [cachedLocal, cachedRemote];
    }
    // Cache partiel ou expiré, charge tout
  }
  sendSyncProgress('load_remote', 'Chargement des marque-pages distants...', 25);
  return Promise.all([getFirefoxBookmarks(), getNextcloudBookmarks()]);
}

async function saveBookmarksCache(localBookmarks, remoteBookmarks) {
  await Promise.all([
    NCBookmarksCache.saveFirefoxBookmarksCache(localBookmarks),
    NCBookmarksCache.saveNextcloudBookmarksCache(remoteBookmarks)
  ]);
  await NCBookmarksCache.updateLastFullSyncTimestamp();
  NCBookmarksLogger.info('Cache mis à jour après sync complète');
}

// Notification de fin : conflits (avec les stats) ou succès
async function notifySyncResult(stats) {
  const messages = [];
  if (conflicts.length > 0) {
    await browser.storage.local.set({ lastConflicts: conflicts });
    if (stats.addedToFirefox > 0) messages.push(`+${stats.addedToFirefox} Firefox`);
    if (stats.addedToNextcloud > 0) messages.push(`+${stats.addedToNextcloud} Nextcloud`);
    if (stats.updatedInNextcloud > 0) messages.push(`~${stats.updatedInNextcloud} maj`);
    await notifySafe('sync-conflicts', {
      type: 'basic',
      iconUrl: 'icons/icon-48.svg',
      title: 'Conflits de synchronisation',
      message: `${conflicts.length} conflit(s). ${messages.length > 0 ? messages.join(', ') + '.' : 'Tous à jour.'}`
    });
    return;
  }

  if (stats.addedToFirefox > 0) messages.push(`+${stats.addedToFirefox} dans Firefox`);
  if (stats.addedToNextcloud > 0) messages.push(`+${stats.addedToNextcloud} dans Nextcloud`);
  if (stats.updatedInNextcloud > 0 || stats.updatedInFirefox > 0) messages.push(`~${stats.updatedInNextcloud + stats.updatedInFirefox} mis à jour`);
  if (stats.deletedFromFirefox > 0 || stats.deletedFromNextcloud > 0) messages.push(`-${stats.deletedFromFirefox + stats.deletedFromNextcloud} supprimés`);
  if (messages.length === 0) messages.push('Tous les marque-pages sont à jour');
  await notifySafe('sync-success', {
    type: 'basic',
    iconUrl: 'icons/icon-48.svg',
    title: 'Synchronisation réussie',
    message: messages.join(', ')
  });
}

// Charge, compare et synchronise ; renvoie les stats de la dernière sync
async function runSync() {
  sendSyncProgress('init_api', 'Connexion à Nextcloud...', 5);
  if (!(await initNextcloudAPI())) {
    throw new Error('Configuration Nextcloud manquante');
  }

  // Synchronise la structure des dossiers (crée les dossiers manquants de chaque côté)
  sendSyncProgress('sync_folders', 'Synchronisation de la structure des dossiers...', {}, 12);
  try {
    folderMapping = await buildFolderMapping();
  } catch (err) {
    NCBookmarksLogger.error('[SYNC] Erreur synchronisation des dossiers:', { error: err.message });
  }

  sendSyncProgress('check_cache', 'Vérification du cache...', 10);
  const useCache = await NCBookmarksCache?.canUseCache();
  NCBookmarksLogger.info(`Mode sync: ${useCache ? 'incrémentale (avec cache)' : 'complète'}`);

  sendSyncProgress('load_local', 'Chargement des marque-pages locaux...', 15);
  const [localBookmarks, remoteBookmarks] = await loadBookmarks(useCache);
  const counts = { localCount: localBookmarks.length, remoteCount: remoteBookmarks.length };
  sendSyncProgress('detect_conflicts', 'Détection des conflits...', counts, 30);
  NCBookmarksLogger.info(`Marque-pages chargés: ${localBookmarks.length} local, ${remoteBookmarks.length} distant`);

  // Synchronise toujours, même s'il y a des conflits
  conflicts = detectConflicts(localBookmarks, remoteBookmarks);
  sendSyncProgress('sync_start', `Synchronisation en cours (${conflicts.length} conflits détectés)...`,
    { ...counts, conflictCount: conflicts.length }, 35);
  const stats = await syncBookmarks(localBookmarks, remoteBookmarks);

  // Le cache décrit les deux côtés avant la synchronisation : s'ils ont changé, il ne vaut plus rien
  // (le réutiliser rejouerait les mêmes ajouts et suppressions sur des listes périmées)
  if (Object.values(stats).some(count => count > 0)) {
    await NCBookmarksCache.clearBookmarksCache();
  } else if (!useCache) {
    await saveBookmarksCache(localBookmarks, remoteBookmarks);
  }
  await notifySyncResult(stats);
  return { ...counts, ...stats };
}

// Effectue une synchronisation complète
async function fullSync() {
  if (syncInProgress) {
    NCBookmarksLogger.warn('Synchronisation déjà en cours...');
    return;
  }

  syncInProgress = true;
  conflicts = [];
  sendSyncProgress('start', 'Initialisation de la synchronisation...', 0);

  try {
    const { localCount, remoteCount, ...stats } = await runSync();
    await browser.storage.local.set({
      lastSync: Date.now(),
      lastSyncStats: { localCount, remoteCount, ...stats, conflictsCount: conflicts.length }
    });
    sendSyncProgress('complete', 'Synchronisation terminée avec succès !', { ...stats, conflictCount: conflicts.length }, 100);
  } catch (err) {
    NCBookmarksLogger.error('Erreur de synchronisation:', { error: err.message });
    sendSyncProgress('error', `Erreur: ${err.message}`, {}, null);
    await notifySafe('sync-error', {
      type: 'basic',
      iconUrl: 'icons/icon-48.svg',
      title: 'Erreur de synchronisation',
      message: err.message
    });
  } finally {
    syncInProgress = false;
    sendSyncProgress('finished', 'Prêt', null);
  }
}

// Synchronisation rapide (pour le bouton de l'extension)
async function quickSync() {
  await fullSync();
}

// ============================================
// Synchronisation automatique
// ============================================

// Configure l'alarme pour la synchronisation automatique
async function setupAutoSync() {
  const config = await loadConfig();

  // Annule les alarmes existantes
  await browser.alarms.clearAll();

  if (config.autoSync && config.syncInterval > 0) {
    await browser.alarms.create('auto-sync', {
      periodInMinutes: config.syncInterval
    });
    NCBookmarksLogger.info(`Synchronisation automatique activée (toutes les ${config.syncInterval} min)`);
  }
}

// Initialise l'extension
async function init() {
  try {
    await setupAutoSync();
  } catch (err) {
    NCBookmarksLogger.error('[INIT] Erreur setupAutoSync:', { error: err.message });
  }

  // Écoute les changements de configuration
  browser.storage.onChanged.addListener(async (changes) => {
    try {
      if (changes.nextcloudUrl || changes.nextcloudUsername || changes.nextcloudToken || changes.syncInterval || changes.autoSync) {
        await setupAutoSync();
        // NB: pas de reset de nextcloudAPI ici — fullSync() appelle systématiquement
        // initNextcloudAPI() (qui relit la config à chaque fois, sans cache) en tout début
        // de synchronisation. Mettre nextcloudAPI à null ici créait une fenêtre de course :
        // si ce listener se déclenchait pendant une synchronisation déjà en cours (ex.
        // sauvegarde des paramètres pendant une sync auto), tous les appels
        // nextcloudAPI.createBookmark/updateBookmark/deleteBookmark en cours échouaient
        // avec "nextcloudAPI is null" sans que la sync ne le signale clairement.
      }
    } catch (err) {
      NCBookmarksLogger.error('[STORAGE_LISTENER] Erreur:', { error: err.message });
    }
  });

  // Écoute l'alarme de synchronisation automatique
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'auto-sync') {
      fullSync().catch(error => {
        NCBookmarksLogger.error('[AUTO_SYNC] Erreur:', { error: error.message });
      });
    }
  });
}
