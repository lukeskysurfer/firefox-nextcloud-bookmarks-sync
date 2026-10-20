// ============================================
// Page des options - Liste et export des marque-pages
// ============================================

// Favicon générique (SVG encodé en data URI, sans guillemets/# bruts) utilisée en dernier recours
const GENERIC_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#666" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-family="Arial">🌐</text></svg>'
);

// Génère une favicon par défaut à partir de l'URL
function getDefaultFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    // Couleurs basées sur le hash du domaine pour une apparence unique
    const hash = domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
      '#1abc9c', '#d35400', '#34495e', '#16a085', '#27ae60'
    ];
    const color = colors[hash % colors.length];
    const initial = domain.charAt(0).toUpperCase();

    // Génère un SVG avec la première lettre du domaine, encodé pour être utilisable
    // sans casser l'attribut HTML src (les guillemets/# bruts d'un SVG inline y sont interdits)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${color}" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-family="Arial">${initial}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  } catch (e) {
    return GENERIC_FAVICON;
  }
}

// Nom du dossier Nextcloud tel qu'affiché dans la liste et l'export
function nextcloudFolderLabel(b) {
  return b.folders && b.folders.length > 0 ? `Folder ${b.folders[0]}` : (b.folder ? b.folder.name : 'Racine');
}

// Client Nextcloud depuis la configuration enregistrée, ou null si elle est incomplète
async function nextcloudApiFromConfig() {
  const config = await browser.storage.local.get(['nextcloudUrl', 'nextcloudUsername', 'nextcloudToken']);
  if (!config.nextcloudUrl || !config.nextcloudUsername || !config.nextcloudToken) {
    return null;
  }
  return new window.NextcloudBookmarksAPI(config.nextcloudUrl, config.nextcloudUsername, config.nextcloudToken);
}

async function fetchNextcloudBookmarks() {
  const api = await nextcloudApiFromConfig();
  if (!api) return [];
  try {
    const ncBookmarks = await api.getAllBookmarks();
    return ncBookmarks.map(b => ({
      id: `nextcloud_${b.id}`,
      url: b.url,
      title: b.title,
      dateAdded: new Date((b.added || b.created_at) * 1000).getTime(), // added est en secondes UNIX
      lastModified: new Date((b.lastmodified || b.updated_at || b.added || b.created_at || 0) * 1000).getTime(),
      folder: nextcloudFolderLabel(b),
      tags: b.tags || [],
      description: b.description || '',
      source: 'nextcloud'
    }));
  } catch (error) {
    console.error('Erreur chargement Nextcloud:', error);
    return [];
  }
}

// Détaille l'écart entre local et Nextcloud (par URL) pour comprendre d'où il vient :
// marque-pages réellement absents d'un côté, vs. doublons d'URL côté Firefox
// (plusieurs marque-pages Firefox pointant vers la même URL ne comptent que pour 1 côté Nextcloud).
function showBookmarksDiff(firefoxBookmarks, nextcloudBookmarks) {
  const diffStat = document.getElementById('bookmarks-diff-stat');
  const localUrlCounts = new Map();
  for (const b of firefoxBookmarks) {
    localUrlCounts.set(b.url, (localUrlCounts.get(b.url) || 0) + 1);
  }
  const nextcloudUrls = new Set(nextcloudBookmarks.map(b => b.url));

  const localDuplicates = [...localUrlCounts.values()].reduce((sum, n) => sum + (n > 1 ? n - 1 : 0), 0);
  const onlyLocal = [...localUrlCounts.keys()].filter(url => !nextcloudUrls.has(url)).length;
  const onlyNextcloud = nextcloudBookmarks.filter(b => !localUrlCounts.has(b.url)).length;

  const parts = [];
  if (onlyLocal > 0) parts.push(`${onlyLocal} uniquement local`);
  if (onlyNextcloud > 0) parts.push(`${onlyNextcloud} uniquement Nextcloud`);
  if (localDuplicates > 0) parts.push(`${localDuplicates} doublon(s) d'URL côté Firefox`);

  if (parts.length > 0) {
    diffStat.textContent = `⚠️ ${parts.join(', ')}`;
    diffStat.style.display = 'inline';
  } else {
    diffStat.style.display = 'none';
  }
}

// Charge les marque-pages depuis Firefox et Nextcloud
async function loadBookmarks() {
  const bookmarksList = document.getElementById('bookmarks-list');
  bookmarksList.innerHTML = '<div class="loading">Chargement en cours...</div>';

  try {
    const firefoxBookmarks = (await browser.bookmarks.search({}))
      .filter(b => b.url && !b.url.startsWith('place:'));
    const nextcloudBookmarks = await fetchNextcloudBookmarks();

    document.getElementById('local-count').textContent = firefoxBookmarks.length;
    document.getElementById('nextcloud-count').textContent = nextcloudBookmarks.length;
    showBookmarksDiff(firefoxBookmarks, nextcloudBookmarks);
    displayBookmarks(firefoxBookmarks, nextcloudBookmarks);
  } catch (error) {
    const errDiv = document.createElement('div');
    errDiv.className = 'error';
    errDiv.textContent = `Erreur: ${error.message}`;
    bookmarksList.replaceChildren(errDiv);
  }
}

// Fusionne les deux sources en dédupliquant par URL (Firefox prioritaire), triées par titre
function mergeBookmarks(firefoxBookmarks, nextcloudBookmarks) {
  const byUrl = new Map();
  for (const b of firefoxBookmarks) {
    if (byUrl.has(b.url)) continue;
    byUrl.set(b.url, {
      id: `firefox_${b.id}`,
      url: b.url,
      title: b.title,
      favicon: b.faviconUrl || getDefaultFavicon(b.url),
      folder: b.parentId ? 'Dossier Firefox' : 'Racine',
      dateAdded: b.dateAdded,
      lastModified: b.dateLastUsed || b.dateAdded,
      tags: [],
      source: 'firefox'
    });
  }
  for (const b of nextcloudBookmarks) {
    if (!byUrl.has(b.url)) byUrl.set(b.url, b);
  }
  return [...byUrl.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function textDiv(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

function faviconImage(bookmark) {
  const img = document.createElement('img');
  img.src = bookmark.favicon || getDefaultFavicon(bookmark.url);
  img.alt = '';
  img.className = 'favicon';
  img.width = 16;
  img.height = 16;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    img.src = GENERIC_FAVICON;
  }, { once: true });
  return img;
}

function bookmarkInfo(bookmark) {
  const info = document.createElement('div');
  info.className = 'info';

  const metaDiv = document.createElement('div');
  metaDiv.className = 'meta';
  const sourceSpan = document.createElement('span');
  sourceSpan.className = `source ${bookmark.source}`;
  sourceSpan.textContent = bookmark.source === 'firefox' ? 'Firefox' : 'Nextcloud';
  const folderSpan = document.createElement('span');
  folderSpan.className = 'folder';
  folderSpan.textContent = bookmark.folder;
  metaDiv.append(sourceSpan, folderSpan);

  info.append(textDiv('title', bookmark.title), textDiv('url', bookmark.url), metaDiv);

  if (bookmark.tags.length > 0) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'tags';
    for (const tag of bookmark.tags) {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'tag';
      tagSpan.textContent = tag;
      tagsDiv.appendChild(tagSpan);
    }
    info.appendChild(tagsDiv);
  }
  return info;
}

function iconButton(title, icon, onClick) {
  const btn = document.createElement('button');
  btn.className = 'btn-icon';
  btn.title = title;
  btn.textContent = icon;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderBookmarkItem(bookmark) {
  const item = document.createElement('div');
  item.className = 'bookmark-item';
  item.setAttribute('data-url', bookmark.url);
  item.setAttribute('data-source', bookmark.source);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';
  actionsDiv.append(
    iconButton('Ouvrir', '🔗', () => browser.tabs.create({ url: bookmark.url })),
    iconButton("Copier l'URL", '📋', () => {
      navigator.clipboard.writeText(bookmark.url).then(() => {
        showNotification('URL copiée dans le presse-papiers !', 'success');
      });
    })
  );

  item.append(faviconImage(bookmark), bookmarkInfo(bookmark), actionsDiv);
  return item;
}

function renderBookmarks(bookmarks) {
  const bookmarksList = document.getElementById('bookmarks-list');
  if (bookmarks.length === 0) {
    bookmarksList.replaceChildren(emptyState('🔍', ['Aucun marque-page trouvé']));
    return;
  }
  bookmarksList.replaceChildren(...bookmarks.map(renderBookmarkItem));
}

// Affiche les marque-pages et branche la recherche et le filtre par source
function displayBookmarks(firefoxBookmarks, nextcloudBookmarks) {
  const searchInput = document.getElementById('bookmarks-search');
  const sourceFilter = document.getElementById('bookmarks-source');
  const allBookmarks = mergeBookmarks(firefoxBookmarks, nextcloudBookmarks);

  const applyFilters = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const sourceFilterValue = sourceFilter.value;
    renderBookmarks(allBookmarks.filter(b => {
      const matchesSearch = b.title.toLowerCase().includes(searchTerm) ||
                           b.url.toLowerCase().includes(searchTerm);
      const matchesSource = sourceFilterValue === 'all' || b.source === sourceFilterValue;
      return matchesSearch && matchesSource;
    }));
  };

  renderBookmarks(allBookmarks);
  searchInput.addEventListener('input', applyFilters);
  sourceFilter.addEventListener('change', applyFilters);
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Page HTML autonome listant les marque-pages Nextcloud
function bookmarksExportHtml(bookmarks) {
  const items = bookmarks.map(b => `
          <div class="bookmark">
            <div><a href="${escapeHtml(b.url)}" target="_blank">${escapeHtml(b.title)}</a></div>
            <div class="tags">${escapeHtml(b.tags ? b.tags.join(', ') : '')} | ${escapeHtml(nextcloudFolderLabel(b))}</div>
          </div>
        `).join('');
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Marque-pages exportés</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .bookmark { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
          .bookmark a { color: #0066cc; text-decoration: none; }
          .bookmark a:hover { text-decoration: underline; }
          .tags { color: #666; font-size: 12px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <h1>Marque-pages exportés (${bookmarks.length})</h1>
        <p>Exportés depuis Nextcloud le ${new Date().toLocaleString('fr-FR')}</p>
        ${items}
      </body>
      </html>
    `;
}

async function exportBookmarks() {
  try {
    const api = await nextcloudApiFromConfig();
    if (!api) {
      showNotification('Veuillez configurer Nextcloud d\'abord', 'error');
      return;
    }
    const bookmarks = await api.getAllBookmarks();
    downloadFile(bookmarksExportHtml(bookmarks), 'text/html',
      `bookmarks_export_${new Date().toISOString().slice(0, 10)}.html`);
    showNotification('Marque-pages exportés avec succès !', 'success');
  } catch (error) {
    showNotification(`Erreur lors de l'export: ${error.message}`, 'error');
  }
}
