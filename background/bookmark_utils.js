// ============================================
// Utilitaires pour la gestion des marque-pages
// ============================================

/**
 * Normalise un marque-page pour un format commun
 */
function normalizeBookmark(bookmark, source) {
  // Extraire l'ID numérique et le préfixe
  const idParts = bookmark.id?.split('_') || [];
  const prefix = idParts[0] || source;
  const numericId = idParts.slice(1).join('_') || bookmark.id;
  
  return {
    id: `${prefix}_${numericId}`,
    url: bookmark.url,
    title: bookmark.title || bookmark.url,
    dateAdded: bookmark.dateAdded || bookmark.created_at * 1000 || 0,
    lastModified: bookmark.lastModified || bookmark.lastmodified * 1000 || bookmark.dateAdded || bookmark.created_at * 1000 || 0,
    folderId: bookmark.folderId || bookmark.folder || null,
    folderName: bookmark.folderName || bookmark.folder?.name || 'Racine',
    tags: bookmark.tags || [],
    description: bookmark.description || '',
    source: source
  };
}

/**
 * Compare deux marque-pages pour détecter les différences
 */
function compareBookmarks(a, b) {
  const differences = [];
  
  if (a.url !== b.url) differences.push('url');
  if (a.title !== b.title) differences.push('title');
  if (a.folderId !== b.folderId) differences.push('folder');
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) differences.push('tags');
  if (a.description !== b.description) differences.push('description');
  
  return differences;
}

/**
 * Extrait l'ID numérique d'un ID préfixé
 */
function extractNumericId(id) {
  if (!id) return null;
  
  // Supprime les préfixes connus
  const prefixes = ['firefox_', 'nextcloud_', 'nextcloud_folder_'];
  let numericId = id;
  
  for (const prefix of prefixes) {
    if (numericId.startsWith(prefix)) {
      numericId = numericId.substring(prefix.length);
      break;
    }
  }
  
  return numericId;
}

/**
 * Crée un ID unique pour un marque-page basé sur l'URL
 */
function createBookmarkId(url, source) {
  // Nettoie l'URL pour créer un ID
  try {
    const parsed = new URL(url);
    // Utilise le hostname + path pour créer un ID unique
    const cleanUrl = `${parsed.hostname}${parsed.pathname}`.replace(/[^a-zA-Z0-9]/g, '_');
    return `${source}_${cleanUrl}`;
  } catch (e) {
    // Si l'URL est invalide, utilise un hash simple
    const hash = url.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `${source}_${hash}`;
  }
}

/**
 * Vérifie si un marque-page est valide
 */
function isValidBookmark(bookmark) {
  if (!bookmark || !bookmark.url) return false;
  
  // Exclut les URLs spéciales de Firefox
  if (bookmark.url.startsWith('place:')) return false;
  if (bookmark.url.startsWith('about:')) return false;
  if (bookmark.url.startsWith('moz-extension:')) return false;
  
  try {
    // Vérifie que l'URL est valide
    new URL(bookmark.url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Trie les marque-pages par date de modification (les plus récents en premier)
 */
function sortBookmarksByDate(bookmarks, ascending = false) {
  return [...bookmarks].sort((a, b) => {
    const dateA = a.lastModified || a.dateAdded || 0;
    const dateB = b.lastModified || b.dateAdded || 0;
    return ascending ? dateA - dateB : dateB - dateA;
  });
}

/**
 * Filtre les marque-pages valides
 */
function filterValidBookmarks(bookmarks) {
  return bookmarks.filter(isValidBookmark);
}

/**
 * Crée un objet de statistiques de synchronisation
 */
function createSyncStats() {
  return {
    addedToFirefox: 0,
    addedToNextcloud: 0,
    updatedInNextcloud: 0,
    updatedInFirefox: 0,
    deletedFromFirefox: 0,
    deletedFromNextcloud: 0,
    conflictsCount: 0,
    errorsCount: 0
  };
}

/**
 * Fusionne les statistiques de synchronisation
 */
function mergeSyncStats(stats1, stats2) {
  return {
    addedToFirefox: stats1.addedToFirefox + stats2.addedToFirefox,
    addedToNextcloud: stats1.addedToNextcloud + stats2.addedToNextcloud,
    updatedInNextcloud: stats1.updatedInNextcloud + stats2.updatedInNextcloud,
    updatedInFirefox: stats1.updatedInFirefox + stats2.updatedInFirefox,
    deletedFromFirefox: stats1.deletedFromFirefox + stats2.deletedFromFirefox,
    deletedFromNextcloud: stats1.deletedFromNextcloud + stats2.deletedFromNextcloud,
    conflictsCount: stats1.conflictsCount + stats2.conflictsCount,
    errorsCount: stats1.errorsCount + stats2.errorsCount
  };
}

// ============================================
// Utilitaires pour les Favicons
// ============================================

/**
 * Extrait l'URL du favicon depuis un marque-page Firefox
 */
function extractFaviconFromFirefoxBookmark(bookmark) {
  if (!bookmark) return null;
  
  // Firefox peut avoir faviconUrl directement
  if (bookmark.faviconUrl) {
    return bookmark.faviconUrl;
  }
  
  // Sinon, on peut essayer de générer une URL de favicon
  if (bookmark.url) {
    try {
      const url = new URL(bookmark.url);
      // Format standard pour les favicons
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

/**
 * Convertit une URL de favicon en data URI (base64)
 * Nécessite les permissions CORS, peut échouer
 */
async function urlToDataUri(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    const reader = new FileReader();
    
    return new Promise((resolve) => {
      reader.onload = () => {
        const base64 = reader.result;
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Génère une favicon par défaut en SVG (comme dans options.js)
 */
function generateDefaultFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    const hash = domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
      '#1abc9c', '#d35400', '#34495e', '#16a085', '#27ae60'
    ];
    const color = colors[hash % colors.length];
    const initial = domain.charAt(0).toUpperCase();
    
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${color}" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-family="Arial">${initial}</text></svg>`;
  } catch (e) {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="%23666" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-family="Arial">🌐</text></svg>';
  }
}

// Expose les fonctions globalement
window.NCBookmarksUtils = {
  normalizeBookmark,
  compareBookmarks,
  extractNumericId,
  createBookmarkId,
  isValidBookmark,
  sortBookmarksByDate,
  filterValidBookmarks,
  createSyncStats,
  mergeSyncStats,
  // Favicons
  extractFaviconFromFirefoxBookmark,
  urlToDataUri,
  generateDefaultFavicon
};
