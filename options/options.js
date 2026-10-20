// ============================================
// Page des options - Logique principale
// ============================================

// Polyfill pour Firefox - Assure la compatibilité browser/chrome API
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  window.browser = window.chrome;
}

// Attend que le DOM soit chargé
document.addEventListener('DOMContentLoaded', async () => {
  // Charge la configuration
  await loadSettings();
  
  // Initialise les onglets
  initTabs();
  
  // Configure les écouteurs d'événements
  setupEventListeners();
  
  // Initialise le toggle du thème
  setupThemeToggle();
  
  // Gère le hash initial dans l'URL (ex: #bookmarks)
  handleHashChange();
});

// Écoute les changements de hash (pour la navigation directe)
window.addEventListener('hashchange', handleHashChange);

// ============================================
// Gestion des onglets
// ============================================

// Active un onglet et charge ses données si nécessaire
function activateTab(tabId) {
  const tab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (!tab) return;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(`${tabId}-tab`).classList.add('active');

  if (tabId === 'bookmarks') {
    loadBookmarks();
  } else if (tabId === 'logs') {
    loadLogs();
  }
}

function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
}

// Gère la navigation par hash (ex: #bookmarks)
function handleHashChange() {
  const hash = window.location.hash.slice(1); // Enlève le #
  if (hash) activateTab(hash);
}

// ============================================
// Actions dangereuses
// ============================================

// Réinitialise les paramètres
async function resetSettings() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres ?')) {
    return;
  }
  
  await browser.storage.local.clear();
  location.reload();
}

// Efface le cache
async function clearCache() {
  if (!confirm('Êtes-vous sûr de vouloir effacer le cache local ?')) {
    return;
  }
  
  await browser.storage.local.remove(['lastSync', 'lastConflicts', 'syncLogs']);
  showNotification('Cache effacé avec succès !', 'success');
}

// ============================================
// Écouteurs d'événements
// ============================================

function setupEventListeners() {
  // Sauvegarde des paramètres
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  
  // Test de connexion
  document.getElementById('test-connection').addEventListener('click', testConnection);
  
  // Charger les marque-pages
  document.getElementById('load-bookmarks').addEventListener('click', loadBookmarks);
  document.getElementById('refresh-bookmarks').addEventListener('click', loadBookmarks);
  
  // Export des marque-pages
  document.getElementById('export-bookmarks').addEventListener('click', exportBookmarks);
  
  // Gestion des logs
  document.getElementById('refresh-logs').addEventListener('click', refreshLogs);
  document.getElementById('clear-logs').addEventListener('click', clearLogs);
  document.getElementById('export-logs').addEventListener('click', exportLogs);
  
  // Afficher/masquer le token
  document.getElementById('show-token').addEventListener('click', () => {
    const tokenInput = document.getElementById('nextcloud-token');
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      document.getElementById('show-token').textContent = '🙈';
    } else {
      tokenInput.type = 'password';
      document.getElementById('show-token').textContent = '👁️';
    }
  });
  
  // Actions dangereuses
  document.getElementById('reset-settings').addEventListener('click', resetSettings);
  document.getElementById('clear-cache').addEventListener('click', clearCache);
  
  // Fermer la page
  document.getElementById('close-options').addEventListener('click', () => {
    window.close();
  });
}

// ============================================
// Utilitaires
// ============================================

// Affiche une notification
function showNotification(message, type = 'info') {
  // Crée une notification temporaire
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Style de base
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007dff'};
  `;
  
  document.body.appendChild(notification);
  
  // Animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // Supprime après 3 secondes
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 300);
  }, 3000);
}

// NextcloudBookmarksAPI est chargé via ../lib/nextcloud_api.js dans options.html ; les autres
// fonctions viennent de settings.js, bookmarks.js et logs.js
