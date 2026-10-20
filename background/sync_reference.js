// ============================================
// Background Script - État de référence de la dernière synchronisation
// ============================================

// URLs présentes des deux côtés à la fin de la dernière synchronisation, par compte Nextcloud.
// Sans elles, un marque-page présent d'un seul côté ne dit pas s'il vient d'y être ajouté
// ou s'il vient d'être supprimé de l'autre côté.
const SYNCED_URLS_KEY = 'syncedUrls';

async function syncAccountKey() {
  const { nextcloudUrl, nextcloudUsername } = await loadConfig();
  return `${nextcloudUsername}@${nextcloudUrl}`;
}

// Renvoie les URLs de la dernière synchronisation de ce compte, ou null (première synchronisation, autre compte)
async function loadSyncedUrls() {
  const stored = (await browser.storage.local.get(SYNCED_URLS_KEY))[SYNCED_URLS_KEY];
  if (!stored || stored.account !== await syncAccountKey()) return null;
  return new Set(stored.urls);
}

async function saveSyncedUrls(urls) {
  await browser.storage.local.set({ [SYNCED_URLS_KEY]: { account: await syncAccountKey(), urls: [...urls] } });
}
