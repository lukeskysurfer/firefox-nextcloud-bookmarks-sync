// ============================================
// Background Script - Messages du popup et des options, démarrage
// CRITIQUE : l'écouteur est enregistré AVANT l'initialisation pour éviter
// "Could not establish connection. Receiving end does not exist"
// ============================================

const CONFLICT_RESOLVERS = {
  keepLocal: resolveConflictKeepLocal,
  keepRemote: resolveConflictKeepRemote,
  merge: resolveConflictMerge
};

async function handleForceFullSync() {
  // Vide le cache et force une synchronisation complète
  await NCBookmarksCache?.clearBookmarksCache();
  NCBookmarksLogger?.info('Cache vidé, sync complète forcée');
  await fullSync();
  return { success: true, message: 'Sync complète forcée' };
}

async function handleGetConflicts() {
  try {
    const data = await browser.storage.local.get('lastConflicts');
    return { conflicts: data.lastConflicts || [] };
  } catch (error) {
    return { conflicts: [] };
  }
}

// Résout le conflit d'index `conflictIndex` et le retire de la liste
async function handleResolveConflict(message) {
  const data = await browser.storage.local.get('lastConflicts');
  const storedConflicts = data.lastConflicts || [];
  const conflict = storedConflicts[message.conflictIndex];
  if (!conflict) {
    return { success: false, error: 'Conflit non trouvé' };
  }
  try {
    await CONFLICT_RESOLVERS[message.resolution]?.(conflict);
    storedConflicts.splice(message.conflictIndex, 1);
    await browser.storage.local.set({ lastConflicts: storedConflicts });
    return { success: true };
  } catch (error) {
    NCBookmarksLogger?.error('Erreur résolution conflit:', { error: error.message });
    return { success: false, error: error.message };
  }
}

// Résout tous les conflits en fusionnant (priorité à la version la plus récente)
async function handleResolveAllConflicts() {
  const data = await browser.storage.local.get('lastConflicts');
  const storedConflicts = data.lastConflicts || [];
  let resolvedCount = 0;
  try {
    for (const conflict of storedConflicts) {
      try {
        await resolveConflictMerge(conflict);
        resolvedCount++;
      } catch (error) {
        // Continuer avec les autres conflits
        NCBookmarksLogger?.error('Erreur résolution conflit:', { error: error.message });
      }
    }
    await browser.storage.local.set({ lastConflicts: [] });
    return { success: true, resolved: resolvedCount, total: storedConflicts.length };
  } catch (error) {
    NCBookmarksLogger?.error('Erreur resolveAllConflicts:', { error: error.message });
    return { success: false, error: error.message, resolved: resolvedCount, total: storedConflicts.length };
  }
}

async function handleTestConnection() {
  let loaded;
  try {
    loaded = await initNextcloudAPI();
  } catch (error) {
    return { connected: false, message: `⚠️ INIT ERROR: ${error.message}` };
  }
  if (!loaded) {
    return { connected: false, message: 'Configuration manquante' };
  }
  try {
    return await nextcloudAPI.testConnection();
  } catch (error) {
    NCBookmarksLogger?.error('testConnection error:', { error: error.message });
    return { connected: false, message: `⚠️ BG ERROR: ${error.message}` };
  }
}

async function handleGetSyncStatus() {
  try {
    const data = await browser.storage.local.get('lastSync');
    return { inProgress: syncInProgress, lastSync: data.lastSync };
  } catch (error) {
    return { inProgress: syncInProgress, lastSync: null };
  }
}

const MESSAGE_HANDLERS = {
  sync: async () => {
    await quickSync();
    return { success: true };
  },
  forceFullSync: handleForceFullSync,
  getConflicts: handleGetConflicts,
  resolveConflict: handleResolveConflict,
  resolveAllConflicts: () => handleResolveAllConflicts().catch(error =>
    ({ success: false, error: error.message, resolved: 0, total: 0 })),
  testConnection: handleTestConnection,
  getSyncStatus: handleGetSyncStatus
};

function safeRespond(sendResponse, response) {
  try {
    sendResponse(response);
  } catch (e) {
    NCBookmarksLogger?.error('[MSG_HANDLER] Impossible d\'envoyer la réponse:', { error: e.message });
  }
}

// Enregistre l'écouteur de messages IMMEDIATEMENT, avant toute initialisation
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Test de connexion au background script - TOUJOURS disponible
  if (message.action === 'ping') {
    sendResponse({ pong: true });
    return true;
  }

  const handler = MESSAGE_HANDLERS[message.action];
  if (!handler) return undefined;

  handler(message)
    .then(response => safeRespond(sendResponse, response))
    .catch(error => {
      NCBookmarksLogger?.error(`Erreur ${message.action}:`, { error: error.message });
      safeRespond(sendResponse, { success: false, error: error.message });
    });
  return true; // Pour sendResponse asynchrone
});

// Démarre l'initialisation
try {
  init();
  NCBookmarksLogger?.info('Extension Nextcloud Bookmarks Sync initialisée');
} catch (err) {
  NCBookmarksLogger?.error('[INIT_GLOBAL] Erreur fatale:', { error: err.message });
}
