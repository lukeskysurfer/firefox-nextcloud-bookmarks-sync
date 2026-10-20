// ============================================
// Background Script - Synchronisation de la structure des dossiers
// ============================================

// Récupère tous les dossiers Firefox (hors racine invisible), parents avant enfants
async function getFirefoxFolderNodes() {
  const [rootNode] = await browser.bookmarks.getTree();
  const folders = [];

  function walk(node, parentId) {
    const isFolder = !node.url;
    if (!isFolder) return;
    if (parentId !== null) {
      folders.push({ id: node.id, title: node.title, parentId });
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child, node.id);
      }
    }
  }

  walk(rootNode, null);
  return { rootId: rootNode.id, folders };
}

function hasNextcloudParent(folder) {
  return folder.parent_folder != null && folder.parent_folder !== -1;
}

// Index des dossiers Nextcloud : par id, par parent ('root' ou id parent) et titres
function indexNextcloudFolders(ncFoldersRaw) {
  const index = {
    all: ncFoldersRaw,
    byId: new Map(ncFoldersRaw.map(f => [String(f.id), f])),
    childrenByParent: new Map(),
    titles: {}
  };
  for (const f of ncFoldersRaw) {
    addNextcloudFolder(index, f, hasNextcloudParent(f) ? String(f.parent_folder) : 'root', false);
  }
  return index;
}

function addNextcloudFolder(index, folder, parentKey, isNew = true) {
  if (isNew) {
    index.all.push(folder);
    index.byId.set(String(folder.id), folder);
  }
  index.titles[folder.id] = folder.title;
  if (!index.childrenByParent.has(parentKey)) index.childrenByParent.set(parentKey, []);
  index.childrenByParent.get(parentKey).push(folder);
}

// Nettoie les correspondances devenues invalides (dossier Nextcloud supprimé entre-temps)
function pruneStaleMappings(mapping, index) {
  for (const [ffId, ncId] of Object.entries(mapping.ff2nc)) {
    if (ncId !== null && !index.byId.has(String(ncId))) {
      delete mapping.ff2nc[ffId];
      delete mapping.nc2ff[ncId];
    }
  }
}

// Firefox -> Nextcloud : retrouve ou crée le dossier correspondant ; null en cas d'échec
async function findOrCreateNextcloudFolder(folder, parentNcId, index) {
  const parentKey = parentNcId != null ? String(parentNcId) : 'root';
  const siblings = index.childrenByParent.get(parentKey) || [];
  const existing = siblings.find(f => f.title === folder.title);
  if (existing) return existing;

  try {
    const created = await nextcloudAPI.createFolder(folder.title, parentNcId);
    const createdId = created.id || created.folder?.id || created._embedded?.folders?.[0]?.id;
    const match = { id: createdId, title: folder.title, parent_folder: parentNcId };
    addNextcloudFolder(index, match, parentKey);
    NCBookmarksLogger.info(`[FOLDERS] ✅ Créé côté Nextcloud: ${folder.title}`);
    return match;
  } catch (err) {
    NCBookmarksLogger.error(`[FOLDERS] ❌ Erreur création dossier Nextcloud "${folder.title}":`, { error: err.message });
    return null;
  }
}

// Firefox -> Nextcloud : retrouve ou crée les dossiers manquants (parents avant enfants)
async function mapFirefoxFoldersToNextcloud(mapping, firefoxFolders, index) {
  for (const folder of firefoxFolders) {
    const existingNcId = mapping.ff2nc[folder.id];
    if (existingNcId !== undefined && existingNcId !== null && index.byId.has(String(existingNcId))) {
      continue;
    }

    const parentNcId = mapping.ff2nc[folder.parentId] ?? null;
    const match = await findOrCreateNextcloudFolder(folder, parentNcId, index);
    if (!match) continue;

    mapping.ff2nc[folder.id] = match.id;
    mapping.nc2ff[match.id] = folder.id;
  }
}

// Nextcloud -> Firefox : crée les dossiers manquants (parents avant enfants)
async function createMissingFirefoxFolders(mapping, index) {
  const depthOf = (f) => {
    let depth = 0;
    let current = f;
    while (current && hasNextcloudParent(current) && depth < 50) {
      depth++;
      current = index.byId.get(String(current.parent_folder));
    }
    return depth;
  };
  const sortedNcFolders = [...index.all].sort((a, b) => depthOf(a) - depthOf(b));

  for (const folder of sortedNcFolders) {
    if (mapping.nc2ff[folder.id] !== undefined) continue;

    const parentFfId = hasNextcloudParent(folder)
      ? mapping.nc2ff[folder.parent_folder]
      : 'unfiled_____'; // "Autres marque-pages" : les dossiers ne peuvent pas être créés directement sous la racine invisible

    if (!parentFfId) continue; // Le parent n'est pas encore mappé, sera traité au prochain cycle

    try {
      const created = await browser.bookmarks.create({ parentId: parentFfId, title: folder.title });
      mapping.nc2ff[folder.id] = created.id;
      mapping.ff2nc[created.id] = folder.id;
      NCBookmarksLogger.info(`[FOLDERS] ✅ Créé côté Firefox: ${folder.title}`);
    } catch (err) {
      NCBookmarksLogger.error(`[FOLDERS] ❌ Erreur création dossier Firefox "${folder.title}":`, { error: err.message });
    }
  }
}

// Construit/actualise la correspondance entre dossiers Firefox et dossiers Nextcloud,
// en créant les dossiers manquants de chaque côté pour préserver la hiérarchie complète
async function buildFolderMapping() {
  if (!nextcloudAPI) {
    throw new Error('Nextcloud API non initialisée');
  }

  const stored = await browser.storage.local.get('folderMapping');
  const mapping = stored.folderMapping || { ff2nc: {}, nc2ff: {} };

  const [{ rootId, folders: firefoxFolders }, ncFoldersRaw] = await Promise.all([
    getFirefoxFolderNodes(),
    nextcloudAPI.getFolders()
  ]);

  mapping.ff2nc[rootId] = null; // Racine Firefox = racine Nextcloud

  const index = indexNextcloudFolders(ncFoldersRaw);
  pruneStaleMappings(mapping, index);
  await mapFirefoxFoldersToNextcloud(mapping, firefoxFolders, index);
  await createMissingFirefoxFolders(mapping, index);

  ncFolderTitles = index.titles;
  await browser.storage.local.set({ folderMapping: mapping });
  NCBookmarksLogger.info(`[FOLDERS] Mapping mis à jour: ${Object.keys(mapping.ff2nc).length} dossiers Firefox, ${Object.keys(mapping.nc2ff).length} dossiers Nextcloud`);

  return mapping;
}
