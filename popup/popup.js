// ============================================
// Gestion du thème (mode sombre)
// ============================================

/**
 * Applique le thème (clair ou sombre) au popup
 */
function applyTheme(isDark = false) {
  const html = document.documentElement;
  
  if (isDark) {
    html.classList.add('dark-mode');
    html.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    html.classList.remove('dark-mode');
    html.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  }
}

// ============================================
// Utilitaires - Affichage de messages de feedback
// ============================================

/**
 * Affiche un message dans l'élément de feedback avec la classe CSS appropriée
 * @param {string} message - Le message à afficher
 * @param {string} type - Type du message: 'info', 'success', 'warning', 'error'
 */
function showFeedback(message, type = 'info') {
  const fb = document.getElementById('click-feedback');
  if (!fb) return;
  
  // Réinitialiser les classes
  fb.className = '';
  fb.textContent = message;
  
  // Ajouter la classe appropriée
  if (type === 'success') {
    fb.classList.add('feedback-success');
  } else if (type === 'warning') {
    fb.classList.add('feedback-warning');
  } else if (type === 'error') {
    fb.classList.add('feedback-error');
  } else {
    fb.classList.add('feedback-info');
  }
}

// ============================================
// Test minimal pour vérifier que le JS s'exécute
// ============================================

// Variable globale pour suivre la progression de la sync
let syncProgress = null;

// Met à jour l'affichage de la progression
function updateSyncProgress(progress) {
  syncProgress = progress;
  
  // Crée ou met à jour l'élément de progression
  let progressElement = document.getElementById('sync-progress');
  
  if (!progressElement) {
    progressElement = document.createElement('div');
    progressElement.id = 'sync-progress';
    progressElement.className = 'sync-progress';
    
    // Insère après debug-info
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
      debugInfo.parentNode.insertBefore(progressElement, debugInfo.nextSibling);
    } else {
      document.getElementById('status-section').prepend(progressElement);
    }
  }
  
  // Met à jour le contenu
  if (progress.step === 'finished') {
    progressElement.textContent = '';
    progressElement.style.display = 'none';
  } else {
    progressElement.style.display = 'block';
    const percent = progress.percent !== null ? ` (${progress.percent}%)` : '';
    progressElement.textContent = `🔄 ${progress.message}${percent}`;
  }
}

// Écouteur global pour les messages de progression
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'sync_progress') {
    updateSyncProgress(message);
  }
});

// Charge les paramètres et applique le thème au démarrage
async function initPopup() {
  try {
    document.getElementById('debug-info').textContent = '✅ JS LOADED';
  
    if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
      window.browser = window.chrome;
    }
  
    // Charge le paramètre darkMode depuis le stockage
    const settings = await browser.storage.local.get('darkMode');
    const isDark = settings.darkMode || false;
    applyTheme(isDark);
    
    // Écoute les changements de paramètres (y compris darkMode)
    browser.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.darkMode !== undefined) {
        applyTheme(changes.darkMode.newValue || false);
      }
    });
  
    if (typeof browser !== 'undefined' && browser.runtime?.openOptionsPage) {
    document.getElementById('debug-info').textContent += ' | browser: ✓';
    
    // Tester si le background script répond
    browser.runtime.sendMessage({ action: 'ping' }).then(response => {
      if (response && response.pong) {
        document.getElementById('debug-info').textContent += ' | background: ✓';
      }
    }).catch(error => {
      document.getElementById('debug-info').textContent += ' | background: ✗ (' + error.message + ')';
      console.error('Background not responding:', error);
    });
    
    // Écouteur pour le bouton Paramètres
    document.getElementById('open-options').addEventListener('click', function() {
      showFeedback('Ouverture...', 'info');
      browser.runtime.openOptionsPage();
    });
    
    // Écouteur pour le bouton Synchroniser maintenant
    document.getElementById('sync-now').addEventListener('click', async function() {
      showFeedback('⏳ Synchronisation en cours... Ne fermez pas le popup !', 'info');
      
      // Désactive le bouton pendant la sync
      this.disabled = true;
      
      // Vérifie d'abord que le background répond
      try {
        const pingResponse = await browser.runtime.sendMessage({ action: 'ping' }).catch(() => null);
        if (!pingResponse || !pingResponse.pong) {
          showFeedback('⚠️ Background non disponible. Attendez 2s et rechargez le popup.', 'warning');
          this.disabled = false;
          console.error('Ping échoué: background script peut être en train de redémarrer');
          // Re-essayer automatiquement après 2 secondes
          setTimeout(() => {
            browser.runtime.sendMessage({ action: 'ping' }).then(resp => {
              if (resp?.pong) {
                showFeedback('✅ Background disponible. Réessayez.', 'success');
              }
            }).catch(() => {});
          }, 2000);
          return;
        }
      } catch (pingError) {
        showFeedback('⚠️ Background non disponible. Rechargez le popup.', 'warning');
        this.disabled = false;
        console.error('Ping échoué:', pingError);
        return;
      }
      
      // Envoie un message au background script pour déclencher la sync
      // Note: On ne bloque pas sur la réponse car la sync peut être longue
      try {
        browser.runtime.sendMessage({ action: 'sync' }).catch(() => {});
        showFeedback('✅ Synchronisation démarrée en arrière-plan', 'success');
        
        // Recharge l'état après un délai
        setTimeout(() => {
          loadSyncStatus();
          loadConflicts();
          this.disabled = false;
        }, 1500);
      } catch (error) {
        showFeedback('❌ Erreur: ' + error.message, 'error');
        this.disabled = false;
        console.error('Erreur sync:', error);
      }
    });
    
    // Écouteur pour le bouton Tester la connexion
    document.getElementById('test-connection').addEventListener('click', async function() {
      showFeedback('Test en cours...', 'info');
      
      // Vérifie d'abord que le background répond
      try {
        const pingResponse = await browser.runtime.sendMessage({ action: 'ping' }).catch(() => null);
        if (!pingResponse || !pingResponse.pong) {
          showFeedback('⚠️ Background non disponible', 'warning');
          console.error('Ping échoué pour testConnection');
          return;
        }
      } catch (pingError) {
        showFeedback('⚠️ Background non disponible', 'warning');
        console.error('Ping échoué pour testConnection:', pingError);
        return;
      }
      
      try {
        const response = await browser.runtime.sendMessage({ action: 'testConnection' }).catch(() => null);
        if (response && response.connected) {
          showFeedback('✅ ' + response.message, 'success');
        } else {
          showFeedback('❌ ' + (response ? response.message : 'Pas de réponse du serveur'), 'error');
        }
      } catch (error) {
        showFeedback('❌ Erreur: ' + error.message, 'error');
        console.error('Erreur test connection:', error);
      }
    });
    
    // Écouteur pour le bouton Voir tous les marque-pages
    document.getElementById('view-bookmarks').addEventListener('click', function() {
      browser.runtime.openOptionsPage();
    });
    
    // Écouteur pour le bouton Forcer sync complète
    document.getElementById('force-full-sync').addEventListener('click', async function() {
      showFeedback('Forçage sync complète...', 'info');
      this.disabled = true;
      
      try {
        const response = await browser.runtime.sendMessage({ action: 'forceFullSync' }).catch(() => null);
        if (response && response.success) {
          showFeedback('✅ Sync complète forcée !', 'success');
          // Recharge les stats après un délai
          setTimeout(() => {
            loadSyncStatus();
            loadConflicts();
            this.disabled = false;
          }, 1500);
        } else {
          showFeedback('⚠️ ' + (response ? response.message : 'Problème'), 'warning');
          this.disabled = false;
        }
      } catch (error) {
        showFeedback('❌ Erreur: ' + error.message, 'error');
        this.disabled = false;
      }
    });
    
    // Écouteur pour le bouton Résoudre tous les conflits (dans le button-group)
    document.getElementById('resolve-all-conflicts').addEventListener('click', function() {
      showFeedback('Résolution de tous les conflits...', 'info');
      
      browser.runtime.sendMessage({ action: 'resolveAllConflicts' }).then(response => {
        if (response && response.success) {
          showFeedback(`✅ ${response.resolved} conflit(s) résolu(s)!`, 'success');
          // Masquer la section des conflits
          document.getElementById('conflicts-section').style.display = 'none';
          document.getElementById('resolve-all-conflicts').style.display = 'none';
          loadConflicts(); // Recharger pour vérifier
        } else {
          showFeedback('⚠️ Problème: ' + (response ? response.error : 'Erreur inconnue'), 'warning');
        }
      }).catch(error => {
        showFeedback('❌ Erreur: ' + error.message, 'error');
        console.error('Erreur resolveAllConflicts:', error);
      });
    });
    
    // Écouteur pour le bouton Résoudre tous automatiquement (dans la section conflits)
    document.getElementById('resolve-all-btn').addEventListener('click', function() {
      document.getElementById('resolve-all-conflicts').click();
    });
    
    // Charger les conflits au démarrage du popup
    loadConflicts();
    
    // Charger et afficher l'état de configuration et la dernière sync
    loadSyncStatus();
    
  } else {
    document.getElementById('debug-info').textContent += ' | browser: ✗';
  }
  } catch (e) {
    const debugInfo = document.getElementById('debug-info');
    debugInfo.textContent = '❌ ERREUR: ' + e.message;
    debugInfo.classList.add('feedback-error');
  }
}

// Démarre l'initialisation du popup
initPopup();

// Charge et affiche l'état de synchronisation
async function loadSyncStatus() {
  try {
    // Vérifie que le background répond
    let backgroundAvailable = false;
    try {
      const pingResponse = await browser.runtime.sendMessage({ action: 'ping' }).catch(() => null);
      backgroundAvailable = !!(pingResponse?.pong);
    } catch (error) {
      console.error('Ping échoué dans loadSyncStatus:', error);
      backgroundAvailable = false;
    }
    
    // Charge la configuration et les stats
    const config = await browser.storage.local.get([
      'nextcloudUrl',
      'nextcloudUsername', 
      'nextcloudToken',
      'lastSync',
      'lastSyncStats'
    ]).catch(() => ({}));
    
    // Met à jour l'état
    const statusElement = document.getElementById('sync-status');
    const lastSyncElement = document.getElementById('last-sync');
    
    // Réinitialiser les classes
    statusElement.className = '';
    
    // Vérifie si configuré
    if (config.nextcloudUrl && config.nextcloudUsername && config.nextcloudToken) {
      statusElement.textContent = backgroundAvailable ? 'Configuré ✓' : 'Configuré (BG indisponible)';
      statusElement.classList.add(backgroundAvailable ? 'status-configured' : 'status-bg-unavailable');
    } else {
      statusElement.textContent = 'Non configuré';
      statusElement.classList.add('status-unconfigured');
    }
    
    // Met à jour la date de dernière synchronisation
    if (config.lastSync) {
      const lastSyncDate = new Date(config.lastSync);
      lastSyncElement.textContent = lastSyncDate.toLocaleString('fr-FR');
    } else {
      lastSyncElement.textContent = '--';
    }
    
    // Supprime l'ancien élément de progression s'il existe
    const oldProgress = document.getElementById('sync-progress');
    if (oldProgress) oldProgress.remove();
    
    // Affiche la progression si des stats sont disponibles
    if (config.lastSyncStats) {
      const stats = config.lastSyncStats;
      const progressElement = document.createElement('div');
      progressElement.id = 'sync-progress';
      
      let progressText = '';
      if (stats.addedToNextcloud > 0) {
        progressText += `+${stats.addedToNextcloud} vers NC `;
      }
      if (stats.addedToFirefox > 0) {
        progressText += `+${stats.addedToFirefox} vers FF `;
      }
      if (stats.updatedInNextcloud > 0 || stats.updatedInFirefox > 0) {
        progressText += `~${stats.updatedInNextcloud + stats.updatedInFirefox} mis à jour`;
      }
      if ((stats.deletedFromFirefox > 0 || stats.deletedFromNextcloud > 0) && (stats.addedToFirefox > 0 || stats.addedToNextcloud > 0 || stats.updatedInNextcloud > 0 || stats.updatedInFirefox > 0)) {
        progressText += ` -${stats.deletedFromFirefox + stats.deletedFromNextcloud} supprimés`;
      }
      if (progressText) {
        progressElement.textContent = progressText.trim();
        
        // Insère après last-sync
        const lastSyncParent = document.getElementById('last-sync').parentElement;
        if (lastSyncParent) {
          lastSyncParent.appendChild(progressElement);
        }
      }
    }
    
    // Affiche un message si le background n'est pas disponible
    if (!backgroundAvailable) {
      const fb = document.getElementById('click-feedback');
      if (fb.textContent === '' || fb.textContent.includes('JS LOADED')) {
        showFeedback('⚠️ Background en cours de redémarrage. Attendez...', 'warning');
      }
    }
    
  } catch (error) {
    console.error('Erreur chargement état sync:', error);
  }
}

// ============================================
// Gestion des conflits
// ============================================

// Charge et affiche les conflits
async function loadConflicts() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getConflicts' });
    const conflicts = response ? response.conflicts : [];
    
    if (conflicts.length > 0) {
      // Affiche la section des conflits
      document.getElementById('conflicts-section').style.display = 'block';
      document.getElementById('resolve-all-conflicts').style.display = 'inline-block';
      
      // Met à jour le compteur
      document.getElementById('conflicts-count').textContent = `${conflicts.length} conflit(s) détecté(s)`;
      
      // Affiche la liste des conflits
      const conflictsList = document.getElementById('conflicts-list');
      conflictsList.innerHTML = conflicts.map((conflict, index) => `
        <div class="conflict-item" data-index="${index}">
          <div class="url">${escapeHtml(conflict.localBookmark.title || conflict.localBookmark.url)}</div>
          <div class="details">
            <strong>Firefox:</strong> ${escapeHtml(conflict.localBookmark.title)}<br>
            <strong>Nextcloud:</strong> ${escapeHtml(conflict.remoteBookmark.title)}<br>
            <em>Différences: ${conflict.differences.join(', ')}</em>
          </div>
          <div class="actions">
            <button class="btn btn-small btn-success resolve-conflict" 
                    data-index="${index}" data-resolution="keepLocal" title="Gardier Firefox">
              💻
            </button>
            <button class="btn btn-small btn-danger resolve-conflict" 
                    data-index="${index}" data-resolution="keepRemote" title="Gardier Nextcloud">
              ☁️
            </button>
            <button class="btn btn-small btn-primary resolve-conflict" 
                    data-index="${index}" data-resolution="merge" title="Fusionner (plus récent)">
              🔄
            </button>
          </div>
        </div>
      `).join('');
      
      // Ajoute les écouteurs pour les boutons de résolution
      document.querySelectorAll('.resolve-conflict').forEach(btn => {
        btn.addEventListener('click', function() {
          const conflictIndex = this.dataset.index;
          const resolution = this.dataset.resolution;
          resolveConflict(conflictIndex, resolution);
        });
      });
      
    } else {
      // Masque la section s'il n'y a pas de conflits
      document.getElementById('conflicts-section').style.display = 'none';
      document.getElementById('resolve-all-conflicts').style.display = 'none';
    }
  } catch (error) {
    console.error('Erreur chargement conflits:', error);
    document.getElementById('conflicts-section').style.display = 'none';
  }
}

// Résout un conflit spécifique
async function resolveConflict(conflictIndex, resolution) {
  showFeedback('Résolution du conflit...', 'info');
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'resolveConflict',
      conflictIndex: parseInt(conflictIndex),
      resolution: resolution
    });
    
    if (response && response.success) {
      showFeedback('✅ Conflit résolu!', 'success');
      // Recharge la liste des conflits
      loadConflicts();
    } else {
      showFeedback('⚠️ Problème de résolution', 'warning');
    }
  } catch (error) {
    showFeedback('❌ Erreur: ' + error.message, 'error');
    console.error('Erreur résolution conflit:', error);
  }
}

// Échappe les caractères HTML pour éviter XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
