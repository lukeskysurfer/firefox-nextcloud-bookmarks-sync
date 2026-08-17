// ============================================
// Background Script - Synchronisation principale
// ============================================

// État global
let nextcloudAPI = null;
let syncInProgress = false;
let conflicts = [];
let progressSubscribers = [];

// Fonction pour envoyer un message de progression au popup
function sendSyncProgress(step, message, stats = {}, percent = null) {
  try {
    const msg = {
      type: 'sync_progress',
      step: step,
      message: message,
      stats: stats,
      percent: percent,
      timestamp: Date.now()
    };
    console.log('[BACKGROUND] Envoi message progression:', step, message, JSON.stringify(stats));
    browser.runtime.sendMessage(msg).catch((e) => {
      console.warn('[BACKGROUND] Message non délivré (popup peut être fermé):', e);
    });
  } catch (e) {
    console.error('[BACKGROUND] Erreur sendSyncProgress:', e);
  }
}

// DEBUG: Vérifier que le script est chargé et que browser est disponible

// Initialise le logger, le cache et le batch config
// DÉSACTIVÉ TEMPORAIREMENT pour diagnostiquer le problème de connexion
// Promise.all([
//   initLogger().catch(err => {
//     console.error('Erreur initialisation logger:', err);
//   }),
//   NCBookmarksCache?.updateCacheTtl().catch(err => {
//     NCBookmarksLogger?.error('Erreur initialisation cache TTL:', { error: err.message });
//   }),
//   NCBookmarksBatch?.updateBatchConfig().catch(err => {
//     NCBookmarksLogger?.error('Erreur initialisation batch config:', { error: err.message });
//   })
// ]).catch(() => {});

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
  
  // Paramètres par défaut pour c.netark.fr
  const defaults = {
    nextcloudUrl: 'https://c.netark.fr',
    nextcloudUsername: 'luke',
    nextcloudToken: '***REMOVED-TOKEN***',
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
    nextcloudAPI = new NextcloudBookmarksAPI(
      config.nextcloudUrl,
      config.nextcloudUsername,
      config.nextcloudToken
    );
    return true;
  }
  return false;
}

// ============================================
// Récupération des marques-pages Firefox
// ============================================

// Récupère tous les marques-pages Firefox (sauf les dossiers système)
async function getFirefoxBookmarks() {
  try {
    const bookmarks = await browser.bookmarks.search({});
    
    // Filtre les marques-pages valides (exclut les dossiers, la barre d'outils, etc.)
    const validBookmarks = [];
    
    for (const bookmark of bookmarks) {
      if (bookmark.url && !bookmark.url.startsWith('place:')) {
        try {
          // Trouve le parent (dossier)
          const parent = bookmark.parentId ? await browser.bookmarks.get(bookmark.parentId).catch(() => null) : null;
          
          // Extrait le favicon si disponible
          const faviconUrl = bookmark.faviconUrl || NCBookmarksUtils?.extractFaviconFromFirefoxBookmark(bookmark);
          
          validBookmarks.push({
            id: `firefox_${bookmark.id}`,
            url: bookmark.url,
            title: bookmark.title,
            dateAdded: bookmark.dateAdded,
            lastModified: bookmark.dateLastUsed || bookmark.dateAdded,
            folderId: parent?.id ? `firefox_${parent.id}` : null,
            folderName: parent?.title || 'Racine',
            tags: [], // Firefox ne gère pas les tags nativement
            faviconUrl: faviconUrl,
            source: 'firefox'
          });
        } catch (err) {
          NCBookmarksLogger.error('Erreur traitement bookmark Firefox:', { error: err.message, bookmark: bookmark.url });
        }
      }
    }
    
    NCBookmarksLogger.info(`[GET_FIREFOX] ${validBookmarks.length} marque-pages trouvés`);
    return validBookmarks;
  } catch (err) {
    NCBookmarksLogger.error('[GET_FIREFOX] Erreur:', { error: err.message });
    throw err;
  }
}

// Récupère un marque-page Firefox par ID
async function getFirefoxBookmark(id) {
  const bookmark = await browser.bookmarks.get(id.replace('firefox_', ''));
  if (!bookmark || !bookmark.url) return null;
  
  const parent = bookmark.parentId ? await browser.bookmarks.get(bookmark.parentId) : null;
  
  return {
    id: `firefox_${bookmark.id}`,
    url: bookmark.url,
    title: bookmark.title,
    dateAdded: bookmark.dateAdded,
    lastModified: bookmark.dateLastUsed || bookmark.dateAdded,
    folderId: parent?.id ? `firefox_${parent.id}` : null,
    folderName: parent?.title || 'Racine',
    tags: [],
    source: 'firefox'
  };
}

// ============================================
// Synchronisation avec Nextcloud
// ============================================

// Récupère tous les marques-pages Nextcloud
async function getNextcloudBookmarks() {
  if (!nextcloudAPI) {
    throw new Error('Nextcloud API non initialisée');
  }
  
  try {
    const bookmarks = await nextcloudAPI.getAllBookmarks();
    NCBookmarksLogger.info(`[GET_NEXTCLOUD] ${bookmarks.length} marque-pages récupérés`);
    
    // Récupère les favicons pour les bookmarks Nextcloud avec batch processing
    const bookmarksWithFavicons = await fetchBookmarksFaviconsBatch(bookmarks);
    
    return bookmarksWithFavicons;
  } catch (error) {
    NCBookmarksLogger.error('[GET_NEXTCLOUD] Erreur:', { error: error.message });
    throw error;
  }
}

// Récupère les favicons par lots pour éviter le rate limiting
async function fetchBookmarksFaviconsBatch(bookmarks) {
  const results = [];
  const bookmarkIds = bookmarks.map(b => b.id);
  
  // 1. Vérifie le cache pour tous les favicons
  const cachedFavicons = await NCBookmarksCache?.getMultipleFaviconsCache(bookmarkIds) || {};
  
  // 2. Identifie les bookmarks sans favicon en cache
  const bookmarksNeedingFavicon = bookmarks.filter(b => {
    // Si le bookmark a déjà un favicon dans la réponse API
    if (b.favicon) {
      return false; // Pas besoin de le récupérer
    }
    // Si on a le favicon en cache
    if (cachedFavicons[b.id]) {
      return false; // Pas besoin de le récupérer
    }
    return true; // Il faut récupérer ce favicon
  });
  
  NCBookmarksLogger.info(`[FAVICONS] ${bookmarkIds.length} bookmarks, ${Object.keys(cachedFavicons).length} en cache, ${bookmarksNeedingFavicon.length} à récupérer`);
  
  // 3. Récupère les favicons manquants par lots avec batch processing
  const faviconCache = { ...cachedFavicons };
  
  if (bookmarksNeedingFavicon.length > 0) {
    // Utilise le batch processor avec concurrency limitée
    await NCBookmarksBatch.processBatch(
      bookmarksNeedingFavicon,
      async (bookmark) => {
        try {
          const faviconData = await nextcloudAPI.getBookmarkFavicon(bookmark.id);
          if (faviconData && faviconData.favicon) {
            // Sauvegarde en cache
            await NCBookmarksCache?.saveFaviconCache(bookmark.id, faviconData.favicon);
            faviconCache[bookmark.id] = faviconData.favicon;
            NCBookmarksLogger.debug(`[FAVICONS] ✅ Favicon récupéré: ${bookmark.id}`);
          } else {
            NCBookmarksLogger.debug(`[FAVICONS] ⚠️ Pas de favicon pour: ${bookmark.id}`);
          }
        } catch (err) {
          // Gestion des erreurs spécifiques
          if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
            NCBookmarksLogger.warn(`[FAVICONS] ⚠️ Rate limited pour: ${bookmark.id}, réessayera plus tard`);
          } else if (err.message.includes('404')) {
            NCBookmarksLogger.debug(`[FAVICONS] ⚠️ Favicon non trouvé: ${bookmark.id}`);
          } else if (err.message.includes('500')) {
            NCBookmarksLogger.warn(`[FAVICONS] ⚠️ Erreur serveur pour: ${bookmark.id}`);
          } else {
            NCBookmarksLogger.debug(`[FAVICONS] ⚠️ Erreur récupération favicon: ${bookmark.id}: ${err.message}`);
          }
          // Ne pas jeter l'erreur, on continue sans favicon
        }
      },
      {
        batchSize: 10,      // 10 requêtes par lot
        delayMs: 100,       // 100ms entre chaque lot
        maxConcurrent: 5    // Max 5 requêtes simultanées
      }
    );
  }
  
  // 4. Construis le résultat final avec tous les bookmarks
  for (const b of bookmarks) {
    let faviconUrl = null;
    
    // Priorité : favicon dans la réponse API > cache > récupéré
    if (b.favicon) {
      faviconUrl = b.favicon;
      // Sauvegarde aussi en cache pour les prochaines fois
      NCBookmarksCache?.saveFaviconCache(b.id, b.favicon).catch(() => {});
    } else if (faviconCache[b.id]) {
      faviconUrl = faviconCache[b.id];
    }
    
    results.push({
      id: `nextcloud_${b.id}`,
      url: b.url,
      title: b.title,
      dateAdded: new Date((b.added || b.created_at) * 1000).getTime(),
      lastModified: new Date((b.lastmodified || b.updated_at || b.added || b.created_at || 0) * 1000).getTime(),
      folderId: b.folders && b.folders.length > 0 ? `nextcloud_folder_${b.folders[0]}` : null,
      folderName: b.folders && b.folders.length > 0 ? `Folder ${b.folders[0]}` : (b.folder ? b.folder.name : 'Racine'),
      tags: b.tags || [],
      description: b.description || '',
      faviconUrl: faviconUrl,
      source: 'nextcloud'
    });
  }
  
  NCBookmarksLogger.info(`[FAVICONS] ✅ Tous les bookmarks traités (${results.length} avec favicons)`);
  return results;
}

// Crée un marque-page dans Firefox
async function createFirefoxBookmark(bookmark) {
  const folderId = bookmark.folderId ? bookmark.folderId.replace('firefox_', '') : null;
  
  const result = await browser.bookmarks.create({
    url: bookmark.url,
    title: bookmark.title,
    parentId: folderId
  });
  
  return {
    id: `firefox_${result.id}`,
    ...bookmark,
    source: 'firefox'
  };
}

// Met à jour un marque-page dans Firefox
async function updateFirefoxBookmark(id, bookmark) {
  const firefoxId = id.replace('firefox_', '');
  await browser.bookmarks.update(firefoxId, {
    url: bookmark.url,
    title: bookmark.title
  });
  
  return { id, ...bookmark, source: 'firefox' };
}

// Supprime un marque-page dans Firefox
async function deleteFirefoxBookmark(id) {
  const firefoxId = id.replace('firefox_', '');
  await browser.bookmarks.remove(firefoxId);
  return true;
}

// ============================================
// Détection des conflits
// ============================================

// Compare deux marques-pages pour détecter les différences
function compareBookmarks(a, b) {
  const differences = [];
  
  if (a.url !== b.url) differences.push('url');
  if (a.title !== b.title) differences.push('title');
  if (a.folderId !== b.folderId) differences.push('folder');
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) differences.push('tags');
  
  return differences;
}

// Détecte les conflits entre les marques-pages locaux et distants
function detectConflicts(localBookmarks, remoteBookmarks) {
  const conflicts = [];
  const localMap = new Map(localBookmarks.map(b => [b.url, b]));
  const remoteMap = new Map(remoteBookmarks.map(b => [b.url, b]));
  
  // Compare les marques-pages existants des deux côtés
  for (const [url, local] of localMap) {
    if (remoteMap.has(url)) {
      const remote = remoteMap.get(url);
      const differences = compareBookmarks(local, remote);
      
      if (differences.length > 0) {
        // Détermine quel marque-page est le plus récent
        const localTime = local.lastModified || local.dateAdded;
        const remoteTime = remote.lastModified || remote.dateAdded;
        
        conflicts.push({
          type: 'conflict',
          localBookmark: local,
          remoteBookmark: remote,
          differences,
          localNewer: localTime > remoteTime,
          remoteNewer: remoteTime > localTime
        });
      }
    }
  }
  
  return conflicts;
}

// ============================================
// Résolution des conflits
// ============================================

// Résout un conflit en gardant la version locale
async function resolveConflictKeepLocal(conflict) {
  await updateFirefoxBookmark(conflict.localBookmark.id, conflict.localBookmark);
  // Extraire l'ID numérique de l'ID nextcloud (gère les deux formats)
  const nextcloudId = conflict.remoteBookmark.id.replace('nextcloud_', '').replace('nextcloud_folder_', '');
  await nextcloudAPI.updateBookmark(nextcloudId, conflict.localBookmark);
}

// Résout un conflit en gardant la version distante
async function resolveConflictKeepRemote(conflict) {
  await createFirefoxBookmark(conflict.remoteBookmark);
  await deleteFirefoxBookmark(conflict.localBookmark.id);
}

// Résout un conflit en fusionnant (priorité à la version la plus récente)
async function resolveConflictMerge(conflict) {
  const merged = conflict.localNewer ? conflict.localBookmark : conflict.remoteBookmark;
  
  if (conflict.localNewer) {
    // Extraire l'ID numérique de l'ID nextcloud (gère les deux formats)
    const nextcloudId = conflict.remoteBookmark.id.replace('nextcloud_', '').replace('nextcloud_folder_', '');
    await nextcloudAPI.updateBookmark(nextcloudId, merged);
  } else {
    await updateFirefoxBookmark(conflict.localBookmark.id, merged);
  }
}

// ============================================
// Synchronisation complète
// ============================================

// Effectue une synchronisation complète
async function fullSync() {
  if (syncInProgress) {
    NCBookmarksLogger.warn('Synchronisation déjà en cours...');
    return;
  }
  
  syncInProgress = true;
  conflicts = [];
  const startTime = Date.now();
  
  sendSyncProgress('start', 'Initialisation de la synchronisation...', 0);
  
  try {
    // Initialise l'API
    sendSyncProgress('init_api', 'Connexion à Nextcloud...', 5);
    const configLoaded = await initNextcloudAPI();
    if (!configLoaded) {
      throw new Error('Configuration Nextcloud manquante');
    }
    
    // Vérifie si on peut utiliser le cache pour une sync rapide
    sendSyncProgress('check_cache', 'Vérification du cache...', 10);
    const useCache = await NCBookmarksCache?.canUseCache();
    NCBookmarksLogger.info(`Mode sync: ${useCache ? 'incrémentale (avec cache)' : 'complète'}`);
    
    // Récupère les marques-pages des deux sources
    sendSyncProgress('load_local', 'Chargement des marque-pages locaux...', 15);
    let localBookmarks, remoteBookmarks;
    
    if (useCache) {
      // Essaye de charger depuis le cache
      const [cachedLocal, cachedRemote] = await Promise.all([
        NCBookmarksCache.getFirefoxBookmarksCache(),
        NCBookmarksCache.getNextcloudBookmarksCache()
      ]);
      
      if (cachedLocal && cachedRemote) {
        NCBookmarksLogger.info('Utilisation du cache pour la synchronisation');
        localBookmarks = cachedLocal;
        remoteBookmarks = cachedRemote;
        sendSyncProgress('cache_used', `Cache utilisé (${localBookmarks.length} local, ${remoteBookmarks.length} distant)`, 20);
      } else {
        // Cache partiel ou expiré, charge tout
        sendSyncProgress('load_remote', 'Chargement des marque-pages distants...', 25);
        [localBookmarks, remoteBookmarks] = await Promise.all([
          getFirefoxBookmarks(),
          getNextcloudBookmarks()
        ]);
      }
    } else {
      // Sync complète
      sendSyncProgress('load_remote', 'Chargement des marque-pages distants...', 25);
      [localBookmarks, remoteBookmarks] = await Promise.all([
        getFirefoxBookmarks(),
        getNextcloudBookmarks()
      ]);
    }
    
    sendSyncProgress('detect_conflicts', `Détection des conflits...`, {
      localCount: localBookmarks.length,
      remoteCount: remoteBookmarks.length
    }, 30);
    NCBookmarksLogger.info(`Marque-pages chargés: ${localBookmarks.length} local, ${remoteBookmarks.length} distant`);
    
    // Détecte les conflits
    conflicts = detectConflicts(localBookmarks, remoteBookmarks);
    
    // ✅ SYNCHRONISE TOUJOURS, même s'il y a des conflits
    // Utilise le batch processing pour les grosses collections
    sendSyncProgress('sync_start', `Synchronisation en cours (${conflicts.length} conflits détectés)...`, {
      localCount: localBookmarks.length,
      remoteCount: remoteBookmarks.length,
      conflictCount: conflicts.length
    }, 35);
    const stats = await syncBookmarks(localBookmarks, remoteBookmarks);
    
    // Sauvegarde le cache après une sync complète
    if (!useCache) {
      await Promise.all([
        NCBookmarksCache.saveFirefoxBookmarksCache(localBookmarks),
        NCBookmarksCache.saveNextcloudBookmarksCache(remoteBookmarks)
      ]);
      await NCBookmarksCache.updateLastFullSyncTimestamp();
      NCBookmarksLogger.info('Cache mis à jour après sync complète');
    }
    
    // Stocke les conflits pour l'UI (même s'il n'y en a pas)
    if (conflicts.length > 0) {
      await browser.storage.local.set({ lastConflicts: conflicts });
      
      // Affiche une notification pour les conflits AVEC les stats
      const messages = [];
      if (stats.addedToFirefox > 0) messages.push(`+${stats.addedToFirefox} Firefox`);
      if (stats.addedToNextcloud > 0) messages.push(`+${stats.addedToNextcloud} Nextcloud`);
      if (stats.updatedInNextcloud > 0) messages.push(`~${stats.updatedInNextcloud} maj`);
      
      await browser.notifications.create('sync-conflicts', {
        type: 'basic',
        iconUrl: 'icons/icon-48.svg',
        title: 'Conflits de synchronisation',
        message: `${conflicts.length} conflit(s). ${messages.length > 0 ? messages.join(', ') + '.' : 'Tous à jour.'}`
      });
    } else {
      // Affiche une notification de succès
      const messages = [];
      if (stats.addedToFirefox > 0) messages.push(`+${stats.addedToFirefox} dans Firefox`);
      if (stats.addedToNextcloud > 0) messages.push(`+${stats.addedToNextcloud} dans Nextcloud`);
      if (stats.updatedInNextcloud > 0 || stats.updatedInFirefox > 0) messages.push(`~${stats.updatedInNextcloud + stats.updatedInFirefox} mis à jour`);
      if (stats.deletedFromFirefox > 0 || stats.deletedFromNextcloud > 0) messages.push(`-${stats.deletedFromFirefox + stats.deletedFromNextcloud} supprimés`);
      if (messages.length === 0) messages.push('Tous les marque-pages sont à jour');
      
      await browser.notifications.create('sync-success', {
        type: 'basic',
        iconUrl: 'icons/icon-48.svg',
        title: 'Synchronisation réussie',
        message: messages.join(', ')
      });
    }
    
    // Met à jour le timestamp et les stats de la dernière sync
    await browser.storage.local.set({
      lastSync: Date.now(),
      lastSyncStats: {
        localCount: localBookmarks.length,
        remoteCount: remoteBookmarks.length,
        addedToFirefox: stats.addedToFirefox,
        addedToNextcloud: stats.addedToNextcloud,
        updatedInNextcloud: stats.updatedInNextcloud,
        updatedInFirefox: stats.updatedInFirefox,
        deletedFromFirefox: stats.deletedFromFirefox,
        deletedFromNextcloud: stats.deletedFromNextcloud,
        conflictsCount: conflicts.length
      }
    });
    
    sendSyncProgress('complete', 'Synchronisation terminée avec succès !', {
      addedToFirefox: stats.addedToFirefox,
      addedToNextcloud: stats.addedToNextcloud,
      updatedInFirefox: stats.updatedInFirefox,
      updatedInNextcloud: stats.updatedInNextcloud,
      deletedFromFirefox: stats.deletedFromFirefox,
      deletedFromNextcloud: stats.deletedFromNextcloud,
      conflictCount: conflicts.length
    }, 100);
    
  } catch (err) {
    NCBookmarksLogger.error('Erreur de synchronisation:', { error: err.message });
    sendSyncProgress('error', `Erreur: ${err.message}`, {}, null);
    await browser.notifications.create('sync-error', {
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

// Synchronise les marques-pages (sans conflits)
async function syncBookmarks(localBookmarks, remoteBookmarks) {
  // Vérifie que l'API Nextcloud est initialisée
  if (!nextcloudAPI) {
    NCBookmarksLogger.warn('[SYNC] nextcloudAPI est null, tentative de réinitialisation...');
    const initialized = await initNextcloudAPI();
    if (!initialized) {
      NCBookmarksLogger.error('[SYNC] Impossible d\'initialiser nextcloudAPI');
      throw new Error('nextcloudAPI non initialisée');
    }
  }
  
  const localUrls = new Set(localBookmarks.map(b => b.url));
  const remoteUrls = new Set(remoteBookmarks.map(b => b.url));
  const localByUrl = new Map(localBookmarks.map(b => [b.url, b]));
  const remoteByUrl = new Map(remoteBookmarks.map(b => [b.url, b]));
  
  let addedToFirefox = 0;
  let addedToNextcloud = 0;
  let updatedInNextcloud = 0;
  let updatedInFirefox = 0;
  let deletedFromFirefox = 0;
  let deletedFromNextcloud = 0;
  
  const totalBookmarks = localBookmarks.length + remoteBookmarks.length;
  
  // Vérifie si le batch processing est activé dans les paramètres
  let useBatch = totalBookmarks > 100;
  try {
    const settings = await browser.storage.local.get(['enableBatchProcessing', 'batchSize']);
    const threshold = settings.batchSize ? parseInt(settings.batchSize) * 2 : 100;
    useBatch = settings.enableBatchProcessing !== false && totalBookmarks > threshold;
  } catch (error) {
    NCBookmarksLogger?.warn('Impossible de charger les paramètres de batch, utilisation des valeurs par défaut');
  }
  
  NCBookmarksLogger.info(`[SYNC] Début synchronisation: ${localBookmarks.length} local, ${remoteBookmarks.length} distant | Batch mode: ${useBatch}`);
  
  if (useBatch) {
    // Mode batch pour les grosses collections
    return await syncBookmarksBatched(
      localBookmarks, remoteBookmarks,
      localUrls, remoteUrls, localByUrl, remoteByUrl
    );
  }
  
  // Mode séquentiel pour les petites collections
  
  // Ajoute les marques-pages distants qui n'existent pas localement
  for (const remote of remoteBookmarks) {
    if (!localUrls.has(remote.url)) {
      try {
        await createFirefoxBookmark(remote);
        addedToFirefox++;
        NCBookmarksLogger.debug(`[SYNC] ✅ Ajouté à Firefox: ${remote.title || remote.url}`);
      } catch (err) {
        NCBookmarksLogger.error(`[SYNC] ❌ Erreur ajout Firefox: ${remote.title || remote.url}`, { error: err.message });
      }
    }
  }
  
  // Ajoute les marques-pages locaux qui n'existent pas à distance
  for (const local of localBookmarks) {
    if (!remoteUrls.has(local.url)) {
      try {
        const ncBookmark = {
          url: local.url,
          title: local.title,
          description: local.description || '',
          tags: local.tags || [],
          folderId: local.folderId
        };
        const created = await nextcloudAPI.createBookmark(ncBookmark);
        
        // Upload le favicon si disponible
        if (local.faviconUrl) {
          try {
            const nextcloudId = created.id || created.bookmark?.id || created._embedded?.bookmarks?.[0]?.id;
            if (nextcloudId) {
              // Convertit l'URL du favicon en data URI
              const faviconData = await NCBookmarksUtils.urlToDataUri(local.faviconUrl);
              if (faviconData) {
                await nextcloudAPI.uploadBookmarkFavicon(nextcloudId, faviconData);
                NCBookmarksLogger.debug(`[SYNC] ✅ Favicon uploadé pour ${local.title || local.url}`);
              }
            }
          } catch (faviconErr) {
            NCBookmarksLogger.warn(`[SYNC] ⚠️ Impossible d'uploader le favicon: ${faviconErr.message}`);
          }
        }
        
        addedToNextcloud++;
        NCBookmarksLogger.debug(`[SYNC] ✅ Ajouté à Nextcloud: ${local.title || local.url}`);
      } catch (err) {
        NCBookmarksLogger.error(`[SYNC] ❌ Erreur ajout Nextcloud: ${local.title || local.url}`, { error: err.message });
      }
    }
  }
  
  // Met à jour les marques-pages existants des deux côtés (si pas de conflit)
  for (const local of localBookmarks) {
    const remote = remoteBookmarks.find(b => b.url === local.url);
    if (remote) {
      const localTime = local.lastModified || local.dateAdded;
      const remoteTime = remote.lastModified || remote.dateAdded;
      
      if (localTime > remoteTime) {
        try {
          const ncBookmark = {
            url: local.url,
            title: local.title,
            description: local.description || '',
            tags: local.tags || [],
            folderId: local.folderId
          };
          const nextcloudId = remote.id.replace('nextcloud_', '').replace('nextcloud_folder_', '');
          await nextcloudAPI.updateBookmark(nextcloudId, ncBookmark);
          
          // Upload le favicon si disponible et différent
          if (local.faviconUrl && local.faviconUrl !== remote.faviconUrl) {
            try {
              const faviconData = await NCBookmarksUtils.urlToDataUri(local.faviconUrl);
              if (faviconData) {
                await nextcloudAPI.uploadBookmarkFavicon(nextcloudId, faviconData);
                NCBookmarksLogger.debug(`[SYNC] ✅ Favicon mis à jour pour ${local.title || local.url}`);
              }
            } catch (faviconErr) {
              NCBookmarksLogger.warn(`[SYNC] ⚠️ Impossible de mettre à jour le favicon: ${faviconErr.message}`);
            }
          }
          
          updatedInNextcloud++;
          NCBookmarksLogger.debug(`[SYNC] ✅ Mis à jour dans Nextcloud: ${local.title || local.url}`);
        } catch (err) {
          NCBookmarksLogger.error(`[SYNC] ❌ Erreur maj Nextcloud: ${local.title || local.url}`, { error: err.message });
        }
      } else if (remoteTime > localTime) {
        try {
          await updateFirefoxBookmark(local.id, remote);
          updatedInFirefox++;
          NCBookmarksLogger.debug(`[SYNC] ✅ Mis à jour dans Firefox: ${local.title || local.url}`);
        } catch (err) {
          NCBookmarksLogger.error(`[SYNC] ❌ Erreur maj Firefox: ${local.title || local.url}`, { error: err.message });
        }
      }
    }
  }
  
  // Détection des suppressions
  for (const url of remoteUrls) {
    if (!localUrls.has(url)) {
      try {
        const remoteBookmark = remoteByUrl.get(url);
        if (remoteBookmark) {
          const nextcloudId = remoteBookmark.id.replace('nextcloud_', '').replace('nextcloud_folder_', '');
          await nextcloudAPI.deleteBookmark(nextcloudId);
          deletedFromNextcloud++;
          NCBookmarksLogger.debug(`[SYNC] 🗑️ Supprimé de Nextcloud: ${remoteBookmark.title || url}`);
        }
      } catch (err) {
        NCBookmarksLogger.error(`[SYNC] ❌ Erreur suppression Nextcloud: ${url}`, { error: err.message });
      }
    }
  }
  
  for (const url of localUrls) {
    if (!remoteUrls.has(url)) {
      try {
        const localBookmark = localByUrl.get(url);
        if (localBookmark) {
          await deleteFirefoxBookmark(localBookmark.id);
          deletedFromFirefox++;
          NCBookmarksLogger.debug(`[SYNC] 🗑️ Supprimé de Firefox: ${localBookmark.title || url}`);
        }
      } catch (err) {
        NCBookmarksLogger.error(`[SYNC] ❌ Erreur suppression Firefox: ${url}`, { error: err.message });
      }
    }
  }
  
  NCBookmarksLogger.info(`[SYNC] Fin: +${addedToFirefox} Firefox, +${addedToNextcloud} Nextcloud, ~${updatedInNextcloud} maj NC, ~${updatedInFirefox} maj FF, -${deletedFromFirefox} del FF, -${deletedFromNextcloud} del NC`);
  
  return {
    addedToFirefox,
    addedToNextcloud,
    updatedInNextcloud,
    updatedInFirefox,
    deletedFromFirefox,
    deletedFromNextcloud
  };
}

// Synchronise les marques-pages en mode batch (pour les grosses collections)
async function syncBookmarksBatched(localBookmarks, remoteBookmarks, localUrls, remoteUrls, localByUrl, remoteByUrl) {
  let addedToFirefox = 0;
  let addedToNextcloud = 0;
  let updatedInNextcloud = 0;
  let updatedInFirefox = 0;
  let deletedFromFirefox = 0;
  let deletedFromNextcloud = 0;
  
  // Vérifie que l'API Nextcloud est initialisée
  if (!nextcloudAPI) {
    NCBookmarksLogger.warn('[SYNC-BATCH] nextcloudAPI est null, tentative de réinitialisation...');
    const initialized = await initNextcloudAPI();
    if (!initialized) {
      NCBookmarksLogger.error('[SYNC-BATCH] Impossible d\'initialiser nextcloudAPI');
      throw new Error('nextcloudAPI non initialisée');
    }
  }
  
  NCBookmarksLogger.info('[SYNC] Mode BATCH activé');
  
  // 1. Ajoute les marques-pages distants qui n'existent pas localement (par lots)
  const remotesToAdd = remoteBookmarks.filter(r => !localUrls.has(r.url));
  if (remotesToAdd.length > 0) {
    NCBookmarksLogger.info(`[SYNC] Ajout de ${remotesToAdd.length} marque-pages à Firefox (batch)`);
    const addStats = await NCBookmarksBatch.processBatch(
      remotesToAdd,
      async (remote) => {
        await createFirefoxBookmark(remote);
        NCBookmarksLogger.debug(`[SYNC-BATCH] ✅ Ajouté à Firefox: ${remote.title || remote.url}`);
      },
      { batchSize: 20, delayMs: 50 }
    );
    addedToFirefox = addStats.success;
  }
  
  // 2. Ajoute les marques-pages locaux qui n'existent pas à distance (par lots)
  const localsToAdd = localBookmarks.filter(l => !remoteUrls.has(l.url));
  if (localsToAdd.length > 0) {
    NCBookmarksLogger.info(`[SYNC] Ajout de ${localsToAdd.length} marque-pages à Nextcloud (batch)`);
    const addStats = await NCBookmarksBatch.processBatch(
      localsToAdd,
      async (local) => {
        const ncBookmark = {
          url: local.url,
          title: local.title,
          description: local.description || '',
          tags: local.tags || [],
          folderId: local.folderId
        };
        await nextcloudAPI.createBookmark(ncBookmark);
        NCBookmarksLogger.debug(`[SYNC-BATCH] ✅ Ajouté à Nextcloud: ${local.title || local.url}`);
      },
      { batchSize: 20, delayMs: 100 }
    );
    addedToNextcloud = addStats.success;
  }
  
  // 3. Met à jour les marques-pages existants (par lots)
  const toUpdate = [];
  for (const local of localBookmarks) {
    const remote = remoteBookmarks.find(b => b.url === local.url);
    if (remote) {
      const localTime = local.lastModified || local.dateAdded;
      const remoteTime = remote.lastModified || remote.dateAdded;
      
      if (localTime > remoteTime) {
        toUpdate.push({ type: 'nextcloud', local, remote });
      } else if (remoteTime > localTime) {
        toUpdate.push({ type: 'firefox', local, remote });
      }
    }
  }
  
  if (toUpdate.length > 0) {
    NCBookmarksLogger.info(`[SYNC] Mise à jour de ${toUpdate.length} marque-pages (batch)`);
    const updateStats = await NCBookmarksBatch.processBatch(
      toUpdate,
      async (item) => {
        if (item.type === 'nextcloud') {
          const ncBookmark = {
            url: item.local.url,
            title: item.local.title,
            description: item.local.description || '',
            tags: item.local.tags || [],
            folderId: item.local.folderId
          };
          const nextcloudId = item.remote.id.replace('nextcloud_', '').replace('nextcloud_folder_', '');
          await nextcloudAPI.updateBookmark(nextcloudId, ncBookmark);
          
          // Upload le favicon si disponible et différent
          if (item.local.faviconUrl && item.local.faviconUrl !== item.remote.faviconUrl) {
            try {
              const faviconData = await NCBookmarksUtils.urlToDataUri(item.local.faviconUrl);
              if (faviconData) {
                await nextcloudAPI.uploadBookmarkFavicon(nextcloudId, faviconData);
                NCBookmarksLogger.debug(`[SYNC-BATCH] ✅ Favicon mis à jour pour ${item.local.title || item.local.url}`);
              }
            } catch (faviconErr) {
              NCBookmarksLogger.warn(`[SYNC-BATCH] ⚠️ Impossible de mettre à jour le favicon: ${faviconErr.message}`);
            }
          }
          
          updatedInNextcloud++;
          NCBookmarksLogger.debug(`[SYNC-BATCH] ✅ Mis à jour dans Nextcloud: ${item.local.title || item.local.url}`);
        } else {
          await updateFirefoxBookmark(item.local.id, item.remote);
          updatedInFirefox++;
          NCBookmarksLogger.debug(`[SYNC-BATCH] ✅ Mis à jour dans Firefox: ${item.local.title || item.local.url}`);
        }
      },
      { batchSize: 10, delayMs: 50 }
    );
  }
  
  // 4. Détection des suppressions (par lots)
  const urlsToDeleteFromNextcloud = [];
  for (const url of remoteUrls) {
    if (!localUrls.has(url)) {
      const remoteBookmark = remoteByUrl.get(url);
      if (remoteBookmark) {
        urlsToDeleteFromNextcloud.push(remoteBookmark);
      }
    }
  }
  
  if (urlsToDeleteFromNextcloud.length > 0) {
    NCBookmarksLogger.info(`[SYNC] Suppression de ${urlsToDeleteFromNextcloud.length} marque-pages de Nextcloud (batch)`);
    const deleteStats = await NCBookmarksBatch.processBatch(
      urlsToDeleteFromNextcloud,
      async (remoteBookmark) => {
        const nextcloudId = remoteBookmark.id.replace('nextcloud_', '').replace('nextcloud_folder_', '');
        await nextcloudAPI.deleteBookmark(nextcloudId);
        deletedFromNextcloud++;
        NCBookmarksLogger.debug(`[SYNC-BATCH] 🗑️ Supprimé de Nextcloud: ${remoteBookmark.title || remoteBookmark.url}`);
      },
      { batchSize: 10, delayMs: 50 }
    );
  }
  
  const urlsToDeleteFromFirefox = [];
  for (const url of localUrls) {
    if (!remoteUrls.has(url)) {
      const localBookmark = localByUrl.get(url);
      if (localBookmark) {
        urlsToDeleteFromFirefox.push(localBookmark);
      }
    }
  }
  
  if (urlsToDeleteFromFirefox.length > 0) {
    NCBookmarksLogger.info(`[SYNC] Suppression de ${urlsToDeleteFromFirefox.length} marque-pages de Firefox (batch)`);
    const deleteStats = await NCBookmarksBatch.processBatch(
      urlsToDeleteFromFirefox,
      async (localBookmark) => {
        await deleteFirefoxBookmark(localBookmark.id);
        deletedFromFirefox++;
        NCBookmarksLogger.debug(`[SYNC-BATCH] 🗑️ Supprimé de Firefox: ${localBookmark.title || localBookmark.url}`);
      },
      { batchSize: 10, delayMs: 50 }
    );
  }
  
  NCBookmarksLogger.info(`[SYNC-BATCH] Fin: +${addedToFirefox} Firefox, +${addedToNextcloud} Nextcloud, ~${updatedInNextcloud} maj NC, ~${updatedInFirefox} maj FF, -${deletedFromFirefox} del FF, -${deletedFromNextcloud} del NC`);
  
  return {
    addedToFirefox,
    addedToNextcloud,
    updatedInNextcloud,
    updatedInFirefox,
    deletedFromFirefox,
    deletedFromNextcloud
  };
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

// ============================================
// Initialisation
// ============================================

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
        nextcloudAPI = null; // Réinitialise l'API avec les nouvelles creds
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

// ============================================
// Écouteur de messages - CRITIQUE: doit être enregistré AVANT l'initialisation
// pour éviter "Could not establish connection. Receiving end does not exist"
// ============================================

// DEBUG: Vérifier que l'on va enregistrer l'écouteur

// Enregistre l'écouteur de messages IMMEDIATEMENT, avant toute initialisation
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Test de connexion au background script - TOUJOURS disponible
    if (message.action === 'ping') {
      sendResponse({ pong: true });
      return true;
    }
    
    switch (message.action) {
      case 'sync':
        quickSync().then(() => {
          try { sendResponse({ success: true }); } catch (e) {}
        }).catch(error => {
          NCBookmarksLogger?.error('Erreur sync depuis popup:', { error: error.message });
          try { sendResponse({ success: false, error: error.message }); } catch (e) {}
        });
        return true; // Pour sendResponse asynchrone
      
      case 'forceFullSync':
        // Vide le cache et force une synchronisation complète
        NCBookmarksCache?.clearBookmarksCache().then(() => {
          NCBookmarksLogger?.info('Cache vidé, sync complète forcée');
          return fullSync();
        }).then(() => {
          try { sendResponse({ success: true, message: 'Sync complète forcée' }); } catch (e) {}
        }).catch(error => {
          NCBookmarksLogger?.error('Erreur forceFullSync:', { error: error.message });
          try { sendResponse({ success: false, error: error.message }); } catch (e) {}
        });
        return true;
      
      case 'getConflicts':
        browser.storage.local.get('lastConflicts').then((data) => {
          try { sendResponse({ conflicts: data.lastConflicts || [] }); } catch (e) {}
        }).catch(error => {
          try { sendResponse({ conflicts: [] }); } catch (e) {}
        });
        return true;
      
      case 'resolveConflict':
        // Récupère le conflit depuis le stockage en utilisant l'index
        browser.storage.local.get('lastConflicts').then(async (data) => {
          const conflicts = data.lastConflicts || [];
          const conflict = conflicts[message.conflictIndex];
          
          if (conflict) {
            try {
              if (message.resolution === 'keepLocal') {
                await resolveConflictKeepLocal(conflict);
              } else if (message.resolution === 'keepRemote') {
                await resolveConflictKeepRemote(conflict);
              } else if (message.resolution === 'merge') {
                await resolveConflictMerge(conflict);
              }
              
              // Supprime le conflit résolu de la liste
              conflicts.splice(message.conflictIndex, 1);
              await browser.storage.local.set({ lastConflicts: conflicts });
              
              try { sendResponse({ success: true }); } catch (e) {}
            } catch (error) {
              NCBookmarksLogger?.error('Erreur résolution conflit:', { error: error.message });
              try { sendResponse({ success: false, error: error.message }); } catch (e) {}
            }
          } else {
            try { sendResponse({ success: false, error: 'Conflit non trouvé' }); } catch (e) {}
          }
        }).catch(error => {
          try { sendResponse({ success: false, error: error.message }); } catch (e) {}
        });
        return true;
        
      case 'resolveAllConflicts':
        // Résout tous les conflits automatiquement (fusion avec priorité à la version la plus récente)
        browser.storage.local.get('lastConflicts').then(async (data) => {
          const conflicts = data.lastConflicts || [];
          let resolvedCount = 0;
          
          try {
            // Résout chaque conflit en fusionnant (garder la version la plus récente)
            for (const conflict of conflicts) {
              try {
                await resolveConflictMerge(conflict);
                resolvedCount++;
              } catch (error) {
                NCBookmarksLogger?.error('Erreur résolution conflit:', { error: error.message });
                // Continuer avec les autres conflits
              }
            }
            
            // Supprime tous les conflits résolus
            await browser.storage.local.set({ lastConflicts: [] });
            
            try { sendResponse({ success: true, resolved: resolvedCount, total: conflicts.length }); } catch (e) {}
          } catch (error) {
            NCBookmarksLogger?.error('Erreur resolveAllConflicts:', { error: error.message });
            try { sendResponse({ success: false, error: error.message, resolved: resolvedCount, total: conflicts.length }); } catch (e) {}
          }
        }).catch(error => {
          try { sendResponse({ success: false, error: error.message, resolved: 0, total: 0 }); } catch (e) {}
        });
        return true;
      
      case 'testConnection':
        initNextcloudAPI().then(async (loaded) => {
          try {
            if (loaded) {
              const result = await nextcloudAPI.testConnection();
              try { sendResponse(result); } catch (e) {}
            } else {
              try { sendResponse({ connected: false, message: 'Configuration manquante' }); } catch (e) {}
            }
          } catch (error) {
            NCBookmarksLogger?.error('testConnection error:', { error: error.message });
            try { sendResponse({ connected: false, message: `⚠️ BG ERROR: ${error.message}` }); } catch (e) {}
          }
        }).catch(error => {
          try { sendResponse({ connected: false, message: `⚠️ INIT ERROR: ${error.message}` }); } catch (e) {}
        });
        return true;
      
      case 'getSyncStatus':
        browser.storage.local.get('lastSync').then(data => {
          try {
            sendResponse({
              inProgress: syncInProgress,
              lastSync: data.lastSync
            });
          } catch (e) {
            NCBookmarksLogger?.error('[GET_SYNC_STATUS] Impossible d\'envoyer la réponse:', { error: e.message });
          }
        }).catch(error => {
          try {
            sendResponse({ inProgress: syncInProgress, lastSync: null });
          } catch (e) {
            NCBookmarksLogger?.error('[GET_SYNC_STATUS] Erreur:', { error: error.message });
          }
        });
        return true;
    }
    } catch (err) {
      NCBookmarksLogger?.error('[MSG_HANDLER] Erreur globale:', { error: err.message });
      try {
        sendResponse({ success: false, error: 'Erreur interne du background script' });
      } catch (e) {
        NCBookmarksLogger?.error('[MSG_HANDLER] Impossible d\'envoyer la réponse:', { error: e.message });
      }
    }
  });

// Démarre l'initialisation
try {
  init();
  NCBookmarksLogger?.info('Extension Nextcloud Bookmarks Sync initialisée');
} catch (err) {
  NCBookmarksLogger?.error('[INIT_GLOBAL] Erreur fatale:', { error: err.message });
}
