// ============================================
// Background Script - Application des changements entre Firefox et Nextcloud
// ============================================

function toNextcloudPayload(local) {
  return {
    url: local.url,
    title: local.title,
    description: local.description || '',
    tags: local.tags || [],
    folderId: local.folderId
  };
}

// Envoie le favicon local vers Nextcloud ; un échec n'interrompt pas la synchronisation
async function uploadFavicon(nextcloudId, local) {
  try {
    const faviconData = await NCBookmarksUtils.urlToDataUri(local.faviconUrl);
    if (faviconData) {
      await nextcloudAPI.uploadBookmarkFavicon(nextcloudId, faviconData);
      NCBookmarksLogger.debug(`[SYNC] ✅ Favicon envoyé pour ${local.title || local.url}`);
    }
  } catch (faviconErr) {
    NCBookmarksLogger.warn(`[SYNC] ⚠️ Impossible d'envoyer le favicon: ${faviconErr.message}`);
  }
}

async function ensureNextcloudAPI() {
  if (nextcloudAPI) return;
  NCBookmarksLogger.warn('[SYNC] nextcloudAPI est null, tentative de réinitialisation...');
  if (!(await initNextcloudAPI())) {
    NCBookmarksLogger.error('[SYNC] Impossible d\'initialiser nextcloudAPI');
    throw new Error('nextcloudAPI non initialisée');
  }
}

// Précalcule toutes les opérations (aucun appel réseau) pour rapporter une progression globale
function planSync(localBookmarks, remoteBookmarks) {
  const localByUrl = new Map(localBookmarks.map(b => [b.url, b]));
  const remoteByUrl = new Map(remoteBookmarks.map(b => [b.url, b]));

  const toUpdate = [];
  for (const local of localBookmarks) {
    const remote = remoteBookmarks.find(b => b.url === local.url);
    if (!remote) continue;
    const localTime = local.lastModified || local.dateAdded;
    const remoteTime = remote.lastModified || remote.dateAdded;
    if (localTime > remoteTime) {
      toUpdate.push({ type: 'nextcloud', local, remote });
    } else if (remoteTime > localTime) {
      toUpdate.push({ type: 'firefox', local, remote });
    }
  }

  return {
    remotesToAdd: remoteBookmarks.filter(r => !localByUrl.has(r.url)),
    localsToAdd: localBookmarks.filter(l => !remoteByUrl.has(l.url)),
    toUpdate,
    toDeleteFromNextcloud: [...remoteByUrl].filter(([url]) => !localByUrl.has(url)).map(([, b]) => b),
    toDeleteFromFirefox: [...localByUrl].filter(([url]) => !remoteByUrl.has(url)).map(([, b]) => b)
  };
}

// Le traitement par lots est réservé aux grosses collections (seuil réglable dans les options)
async function shouldUseBatch(totalBookmarks) {
  try {
    const settings = await browser.storage.local.get(['enableBatchProcessing', 'batchSize']);
    const threshold = settings.batchSize ? parseInt(settings.batchSize) * 2 : 100;
    return settings.enableBatchProcessing !== false && totalBookmarks > threshold;
  } catch (error) {
    NCBookmarksLogger?.warn('Impossible de charger les paramètres de batch, utilisation des valeurs par défaut');
    return totalBookmarks > 100;
  }
}

// Exécute une phase élément par élément ou par lots ; renvoie le nombre de succès
async function runPhase(items, operation, { useBatch, label, batchOptions, onDone }) {
  if (items.length === 0) return 0;
  NCBookmarksLogger.info(`[SYNC] ${label} : ${items.length} marque-pages${useBatch ? ' (batch)' : ''}`);

  if (useBatch) {
    const stats = await NCBookmarksBatch.processBatch(items, operation, { ...batchOptions, onBatchDone: onDone });
    return stats.success;
  }

  let success = 0;
  for (const item of items) {
    try {
      await operation(item);
      success++;
    } catch (err) {
      NCBookmarksLogger.error(`[SYNC] ❌ ${label} : ${item.title || item.url || item.local?.url}`, { error: err.message });
    }
  }
  onDone(items.length);
  return success;
}

async function addToNextcloud(local) {
  const created = await nextcloudAPI.createBookmark(toNextcloudPayload(local));
  const nextcloudId = created.id || created.bookmark?.id || created._embedded?.bookmarks?.[0]?.id;
  if (local.faviconUrl && nextcloudId) {
    await uploadFavicon(nextcloudId, local);
  }
  NCBookmarksLogger.debug(`[SYNC] ✅ Ajouté à Nextcloud: ${local.title || local.url}`);
}

// Met à jour le côté le plus ancien avec la version la plus récente
async function updateOlderSide({ type, local, remote }) {
  if (type === 'firefox') {
    await updateFirefoxBookmark(local.id, remote);
    NCBookmarksLogger.debug(`[SYNC] ✅ Mis à jour dans Firefox: ${local.title || local.url}`);
    return;
  }
  const nextcloudId = nextcloudIdOf(remote);
  await nextcloudAPI.updateBookmark(nextcloudId, toNextcloudPayload(local));
  if (local.faviconUrl && local.faviconUrl !== remote.faviconUrl) {
    await uploadFavicon(nextcloudId, local);
  }
  NCBookmarksLogger.debug(`[SYNC] ✅ Mis à jour dans Nextcloud: ${local.title || local.url}`);
}

// Synchronise les marques-pages (les conflits sont tranchés par la date de modification)
async function syncBookmarks(localBookmarks, remoteBookmarks) {
  await ensureNextcloudAPI();

  const useBatch = await shouldUseBatch(localBookmarks.length + remoteBookmarks.length);
  NCBookmarksLogger.info(`[SYNC] Début synchronisation: ${localBookmarks.length} local, ${remoteBookmarks.length} distant | Batch mode: ${useBatch}`);

  const plan = planSync(localBookmarks, remoteBookmarks);
  const totalOps = plan.remotesToAdd.length + plan.localsToAdd.length + plan.toUpdate.length +
    plan.toDeleteFromNextcloud.length + plan.toDeleteFromFirefox.length;
  let processedOps = 0;
  // Étale la progression de la sync entre 35% (début) et 95% (juste avant la fin)
  const phase = (label, batchSize, delayMs) => ({
    useBatch,
    label,
    batchOptions: { batchSize, delayMs },
    onDone: (n) => {
      processedOps += n;
      const percent = totalOps > 0 ? Math.round(35 + (processedOps / totalOps) * 60) : 95;
      sendSyncProgress('sync_progress_batch', `${label} (${processedOps}/${totalOps})`, {}, percent);
    }
  });

  const stats = { updatedInNextcloud: 0, updatedInFirefox: 0 };
  stats.addedToFirefox = await runPhase(plan.remotesToAdd, createFirefoxBookmark, phase('Ajout à Firefox', 20, 50));
  stats.addedToNextcloud = await runPhase(plan.localsToAdd, addToNextcloud, phase('Ajout à Nextcloud', 20, 100));
  await runPhase(plan.toUpdate, async (item) => {
    await updateOlderSide(item);
    stats[item.type === 'firefox' ? 'updatedInFirefox' : 'updatedInNextcloud']++;
  }, phase('Mise à jour', 10, 50));
  stats.deletedFromNextcloud = await runPhase(plan.toDeleteFromNextcloud,
    (remote) => nextcloudAPI.deleteBookmark(nextcloudIdOf(remote)), phase('Suppression Nextcloud', 10, 50));
  stats.deletedFromFirefox = await runPhase(plan.toDeleteFromFirefox,
    (local) => deleteFirefoxBookmark(local.id), phase('Suppression Firefox', 10, 50));

  NCBookmarksLogger.info(`[SYNC] Fin: +${stats.addedToFirefox} Firefox, +${stats.addedToNextcloud} Nextcloud, ~${stats.updatedInNextcloud} maj NC, ~${stats.updatedInFirefox} maj FF, -${stats.deletedFromFirefox} del FF, -${stats.deletedFromNextcloud} del NC`);
  return stats;
}
