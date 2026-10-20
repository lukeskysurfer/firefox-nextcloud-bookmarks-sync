// ============================================
// Background Script - Marque-pages Firefox et Nextcloud, conflits
// ============================================

// Format commun d'un marque-page Firefox ; `parent` = dossier parent (ou null)
function toLocalFirefoxBookmark(bookmark, parent) {
  return {
    id: `firefox_${bookmark.id}`,
    url: bookmark.url,
    title: bookmark.title,
    dateAdded: bookmark.dateAdded,
    lastModified: bookmark.dateLastUsed || bookmark.dateAdded,
    folderId: parent?.id ? (folderMapping.ff2nc[parent.id] ?? null) : null,
    folderName: parent?.title || 'Racine',
    tags: [], // Firefox ne gère pas les tags nativement
    source: 'firefox'
  };
}

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

          validBookmarks.push({ ...toLocalFirefoxBookmark(bookmark, parent), faviconUrl });
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
  return toLocalFirefoxBookmark(bookmark, parent);
}

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

function logFaviconError(bookmarkId, err) {
  if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
    NCBookmarksLogger.warn(`[FAVICONS] ⚠️ Rate limited pour: ${bookmarkId}, réessayera plus tard`);
  } else if (err.message.includes('404')) {
    NCBookmarksLogger.debug(`[FAVICONS] ⚠️ Favicon non trouvé: ${bookmarkId}`);
  } else if (err.message.includes('500')) {
    NCBookmarksLogger.warn(`[FAVICONS] ⚠️ Erreur serveur pour: ${bookmarkId}`);
  } else {
    NCBookmarksLogger.debug(`[FAVICONS] ⚠️ Erreur récupération favicon: ${bookmarkId}: ${err.message}`);
  }
}

// Récupère les favicons manquants par lots (concurrence limitée) et les ajoute à `faviconCache`
async function fetchMissingFavicons(bookmarks, faviconCache) {
  await NCBookmarksBatch.processBatch(
    bookmarks,
    async (bookmark) => {
      try {
        const faviconData = await nextcloudAPI.getBookmarkFavicon(bookmark.id);
        if (faviconData && faviconData.favicon) {
          await NCBookmarksCache?.saveFaviconCache(bookmark.id, faviconData.favicon);
          faviconCache[bookmark.id] = faviconData.favicon;
          NCBookmarksLogger.debug(`[FAVICONS] ✅ Favicon récupéré: ${bookmark.id}`);
        } else {
          NCBookmarksLogger.debug(`[FAVICONS] ⚠️ Pas de favicon pour: ${bookmark.id}`);
        }
      } catch (err) {
        // Ne pas jeter l'erreur, on continue sans favicon
        logFaviconError(bookmark.id, err);
      }
    },
    {
      batchSize: 10,      // 10 requêtes par lot
      delayMs: 100,       // 100ms entre chaque lot
      maxConcurrent: 5    // Max 5 requêtes simultanées
    }
  );
}

// Format commun d'un marque-page Nextcloud
function toLocalNextcloudBookmark(b, faviconUrl) {
  const folderId = b.folders && b.folders.length > 0 ? b.folders[0] : null;
  return {
    id: `nextcloud_${b.id}`,
    url: b.url,
    title: b.title,
    dateAdded: new Date((b.added || b.created_at) * 1000).getTime(),
    lastModified: new Date((b.lastmodified || b.updated_at || b.added || b.created_at || 0) * 1000).getTime(),
    folderId,
    folderName: folderId !== null ? (ncFolderTitles[folderId] || `Folder ${folderId}`) : 'Racine',
    tags: b.tags || [],
    description: b.description || '',
    faviconUrl: faviconUrl,
    source: 'nextcloud'
  };
}

// Récupère les favicons par lots pour éviter le rate limiting
async function fetchBookmarksFaviconsBatch(bookmarks) {
  const bookmarkIds = bookmarks.map(b => b.id);
  const cachedFavicons = await NCBookmarksCache?.getMultipleFaviconsCache(bookmarkIds) || {};

  // Favicon absent de la réponse API et du cache
  const bookmarksNeedingFavicon = bookmarks.filter(b => !b.favicon && !cachedFavicons[b.id]);

  NCBookmarksLogger.info(`[FAVICONS] ${bookmarkIds.length} bookmarks, ${Object.keys(cachedFavicons).length} en cache, ${bookmarksNeedingFavicon.length} à récupérer`);

  const faviconCache = { ...cachedFavicons };
  if (bookmarksNeedingFavicon.length > 0) {
    await fetchMissingFavicons(bookmarksNeedingFavicon, faviconCache);
  }

  // Priorité : favicon dans la réponse API > cache > récupéré
  const results = bookmarks.map(b => {
    if (b.favicon) {
      // Sauvegarde aussi en cache pour les prochaines fois
      NCBookmarksCache?.saveFaviconCache(b.id, b.favicon).catch(() => {});
      return toLocalNextcloudBookmark(b, b.favicon);
    }
    return toLocalNextcloudBookmark(b, faviconCache[b.id] || null);
  });

  NCBookmarksLogger.info(`[FAVICONS] ✅ Tous les bookmarks traités (${results.length} avec favicons)`);
  return results;
}

// Crée un marque-page dans Firefox
async function createFirefoxBookmark(bookmark) {
  const parentId = (bookmark.folderId !== null && bookmark.folderId !== undefined && folderMapping.nc2ff[bookmark.folderId])
    ? folderMapping.nc2ff[bookmark.folderId]
    : 'unfiled_____'; // "Autres marque-pages" par défaut si le dossier n'est pas mappé

  const result = await browser.bookmarks.create({
    url: bookmark.url,
    title: bookmark.title,
    parentId
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

// Identifiant numérique Nextcloud d'un marque-page distant (gère les deux formats)
function nextcloudIdOf(remote) {
  return remote.id.replace('nextcloud_', '').replace('nextcloud_folder_', '');
}

// ============================================
// Détection et résolution des conflits
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

  for (const [url, local] of localMap) {
    const remote = remoteMap.get(url);
    if (!remote) continue;
    const differences = compareBookmarks(local, remote);
    if (differences.length === 0) continue;

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

  return conflicts;
}

// Résout un conflit en gardant la version locale
async function resolveConflictKeepLocal(conflict) {
  await updateFirefoxBookmark(conflict.localBookmark.id, conflict.localBookmark);
  await nextcloudAPI.updateBookmark(nextcloudIdOf(conflict.remoteBookmark), conflict.localBookmark);
}

// Résout un conflit en gardant la version distante
async function resolveConflictKeepRemote(conflict) {
  await createFirefoxBookmark(conflict.remoteBookmark);
  await deleteFirefoxBookmark(conflict.localBookmark.id);
}

// Résout un conflit en fusionnant (priorité à la version la plus récente)
async function resolveConflictMerge(conflict) {
  if (conflict.localNewer) {
    await nextcloudAPI.updateBookmark(nextcloudIdOf(conflict.remoteBookmark), conflict.localBookmark);
  } else {
    await updateFirefoxBookmark(conflict.localBookmark.id, conflict.remoteBookmark);
  }
}
