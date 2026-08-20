// ============================================
// API Nextcloud Bookmarks
// Documentation: https://github.com/nextcloud/bookmarks/blob/master/docs/api.md
// ============================================
console.log('[NC-BOOKMARKS-SYNC] nextcloud_api.js LOADED');

// Configuration pour le retry avec backoff
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 100, // ms
  maxDelay: 5000, // ms
  retryableStatusCodes: [429, 500, 502, 503, 504] // Codes HTTP pour lesquels on retry
};

// Délai avec backoff exponentiel
function getRetryDelay(attempt) {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

// Vérifie si une erreur est retryable
function isRetryableError(error) {
  if (!error || !error.message) return false;
  
  // Vérifie les codes de statut dans le message
  for (const code of RETRY_CONFIG.retryableStatusCodes) {
    if (error.message.includes(`Status: ${code}`) || error.message.includes(`${code} `)) {
      return true;
    }
  }
  
  // Vérifie les messages classiques
  const retryableMessages = ['Too Many Requests', 'rate limit', 'Internal Server Error', 'Service Unavailable'];
  for (const msg of retryableMessages) {
    if (error.message.includes(msg)) {
      return true;
    }
  }
  
  return false;
}

// ============================================
// Classe NextcloudBookmarksAPI
// ============================================

class NextcloudBookmarksAPI {
  constructor(baseUrl, username, token) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.username = username;
    this.token = token;
    this.apiPath = '/index.php/apps/bookmarks/public/rest/v2';
  }

  // Construit l'URL complète pour un endpoint
  _buildUrl(endpoint = '') {
    return `${this.baseUrl}${this.apiPath}${endpoint}`;
  }

  // Effectue une requête HTTP vers Nextcloud
  async _request(method, endpoint, body = null) {
    const url = this._buildUrl(endpoint);
    
    // Encode username:token en base64 pour Basic Auth
    const authString = `${this.username}:${this.token}`;
    const encodedAuth = btoa(authString);
    
    const headers = {
      'Authorization': `Basic ${encodedAuth}`,
      'Accept': 'application/json',
      'OCS-APIRequest': 'true' // Requis pour Nextcloud 34+ avec l'API OCS
    };

    // Content-Type seulement pour les requêtes avec body
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const options = {
      method,
      headers,
      credentials: 'include' // Pour les cookies de session si nécessaire
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`Erreur Nextcloud (${response.status}) pour URL: ${url}`, responseText);
        throw new Error(`⚠️ REST API Error - URL: ${url} - Status: ${response.status} - Response: ${responseText.substring(0, 200)}`);
      }
      
      // Si c'est du JSON valide, parse-le
      try {
        const jsonData = JSON.parse(responseText);
        
        // Nextcloud 34+ utilise le format OCS {status: 'success', data: [...], meta: {...}}
        // Adapter le format pour être compatible avec les méthodes qui attendent _embedded
        if (jsonData.ocs) {
          // Format OCS complet de Nextcloud 34+
          const ocsData = jsonData.ocs;
          if (ocsData && ocsData.meta && ocsData.data) {
            const resourceType = endpoint.replace(/^\//, '').replace(/\?.*$/, '').split('/')[0];
            const embeddedKey = resourceType + 's';
            return { _embedded: { [embeddedKey]: ocsData.data }, ocs: ocsData };
          }
        }
        
        // Format hybride OCS simple : {status: 'success', data: [...], ticket: '...'}
        if (jsonData.status === 'success' && jsonData.data !== undefined) {
          const resourceType = endpoint.replace(/^\//, '').replace(/\?.*$/, '').split('/')[0];
          const embeddedKey = resourceType + 's';
          return { _embedded: { [embeddedKey]: jsonData.data } };
        }
        
        // Si c'est déjà au format _embedded, le retourner tel quel
        if (jsonData._embedded) {
          return jsonData;
        }
        
        return jsonData;
      } catch (e) {
        // Si ce n'est pas du JSON, retourne le texte brut
        console.error(`Réponse non-JSON pour URL: ${url}`, responseText);
        throw new Error(`Non-JSON response: ${responseText.substring(0, 100)} - URL: ${url}`);
      }
    } catch (error) {
      console.error('Erreur réseau:', error);
      throw new Error(`Network error: ${error.message}`);
    }
  }

  // Effectue une requête avec retry automatique pour les erreurs temporaires
  async _requestWithRetry(method, endpoint, body = null) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await this._request(method, endpoint, body);
      } catch (error) {
        lastError = error;
        
        // Vérifie si l'erreur est retryable
        if (isRetryableError(error) && attempt < RETRY_CONFIG.maxRetries) {
          const delay = getRetryDelay(attempt);
          console.warn(`[RETRY] Tentative ${attempt}/${RETRY_CONFIG.maxRetries} échouée pour ${endpoint}. Retry dans ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Si ce n'est pas retryable ou si on a épuisé les tentatives, on relance l'erreur
        throw error;
      }
    }
    
    // Ne devrait jamais arriver, mais au cas où
    throw lastError;
  }

  // ============================================
  // Dossiers (Folders)
  // ============================================

  // Récupère tous les dossiers
  async getFolders() {
    const data = await this._request('GET', '/folder');
    // Gestion des deux formats : _embedded (REST) et data (OCS)
    if (data._embedded?.folders) {
      return data._embedded.folders;
    }
    if (data.ocs?.data) {
      return data.ocs.data;
    }
    if (Array.isArray(data)) {
      return data;
    }
    return data.folders || data.data || [];
  }

  // Crée un dossier
  async createFolder(name, parentFolderId = null) {
    const body = { title: name };
    if (parentFolderId) {
      body.parent_folder = parentFolderId;
    }
    const data = await this._requestWithRetry('POST', '/folder', body);
    return data;
  }

  // ============================================
  // Marque-pages (Bookmarks)
  // ============================================

  // Récupère tous les marques-pages
  // page=-1 désactive la pagination et retourne tous les résultats
  async getAllBookmarks() {
    const data = await this._requestWithRetry('GET', '/bookmark?page=-1');
    // Gestion des deux formats : _embedded (REST) et data/ocs (OCS)
    if (data._embedded?.bookmarks) {
      return data._embedded.bookmarks;
    }
    if (data.ocs?.data) {
      return data.ocs.data;
    }
    if (Array.isArray(data.data)) {
      return data.data;
    }
    return data.bookmarks || [];
  }

  // Récupère un marque-page par ID
  async getBookmark(id) {
    const data = await this._request('GET', `/bookmark/${id}`);
    return data;
  }

  // Crée un marque-page
  async createBookmark(bookmarkData) {
    const body = {
      url: bookmarkData.url,
      title: bookmarkData.title || bookmarkData.url,
      description: bookmarkData.description || '',
      tags: bookmarkData.tags || [],
      folders: bookmarkData.folderId !== undefined && bookmarkData.folderId !== null ? [bookmarkData.folderId] : []
    };
    const data = await this._requestWithRetry('POST', '/bookmark', body);
    return data;
  }

  // Met à jour un marque-page
  async updateBookmark(id, bookmarkData) {
    const body = {};
    if (bookmarkData.url !== undefined) body.url = bookmarkData.url;
    if (bookmarkData.title !== undefined) body.title = bookmarkData.title;
    if (bookmarkData.description !== undefined) body.description = bookmarkData.description;
    if (bookmarkData.tags !== undefined) body.tags = bookmarkData.tags;
    if (bookmarkData.folderId !== undefined) {
      body.folders = bookmarkData.folderId !== null ? [bookmarkData.folderId] : [];
    }

    const data = await this._requestWithRetry('PUT', `/bookmark/${id}`, body);
    return data;
  }

  // Supprime un marque-page
  async deleteBookmark(id) {
    const data = await this._requestWithRetry('DELETE', `/bookmark/${id}`);
    return data;
  }

  // ============================================
  // Recherche
  // ============================================

  // Recherche des marques-pages par terme
  async searchBookmarks(query, limit = 100) {
    const data = await this._request('GET', `/bookmark?search[]=${encodeURIComponent(query)}&page=-1`);
    if (data._embedded?.bookmarks) return data._embedded.bookmarks;
    if (data.ocs?.data) return data.ocs.data;
    if (Array.isArray(data.data)) return data.data;
    return data.bookmarks || [];
  }

  // Récupère les marques-pages récents
  async getRecentBookmarks(limit = 50) {
    // Utiliser page=-1 pour tous les résultats ou gérer la pagination
    const data = await this._request('GET', '/bookmark?page=-1&sortby=lastmodified');
    if (data._embedded?.bookmarks) return data._embedded.bookmarks;
    if (data.ocs?.data) return data.ocs.data;
    if (Array.isArray(data.data)) return data.data;
    return data.bookmarks || [];
  }

  // ============================================
  // Tags
  // ============================================

  // Récupère tous les tags
  async getAllTags() {
    const data = await this._request('GET', '/tag');
    if (data._embedded?.tags) return data._embedded.tags;
    if (data.ocs?.data) return data.ocs.data;
    if (Array.isArray(data.data)) return data.data;
    return data.tags || [];
  }

  // ============================================
  // Favicons
  // ============================================

  // Récupère le favicon d'un marque-page (avec retry automatique)
  async getBookmarkFavicon(bookmarkId) {
    const data = await this._requestWithRetry('GET', `/bookmark/${bookmarkId}/favicon`);
    return data;
  }

  // Upload un favicon pour un marque-page
  // Le favicon doit être au format data URI (base64) ou URL
  async uploadBookmarkFavicon(bookmarkId, faviconData) {
    const body = {
      favicon: faviconData
    };
    const data = await this._requestWithRetry('PUT', `/bookmark/${bookmarkId}/favicon`, body);
    return data;
  }

  // Supprime le favicon d'un marque-page
  async deleteBookmarkFavicon(bookmarkId) {
    const data = await this._requestWithRetry('DELETE', `/bookmark/${bookmarkId}/favicon`);
    return data;
  }

  // ============================================
  // Utilitaires
  // ============================================

  // Vérifie la connexion à Nextcloud
  async testConnection() {
    try {
      // Test simple avec l'endpoint folders pour vérifier l'authentification
      const result = await this._request('GET', '/folder');
      // Si on reçoit une réponse valide (même vide), la connexion est OK
      return { 
        connected: true, 
        message: '✅ Connexion réussie à Nextcloud !',
        apiVersion: result.ocs?.meta?.api || result._embedded ? 'OCS' : 'REST'
      };
    } catch (error) {
      console.error('TestConnection error:', error);
      return { 
        connected: false, 
        message: `❌ Erreur de connexion: ${error.message}` 
      };
    }
  }

  // Récupère les métadonnées de l'API
  // Récupère les métadonnées de l'API
  async getApiInfo() {
    const data = await this._request('GET', '/folder');
    const folders = data._embedded?.folders || data.ocs?.data || data.folders || [];
    return { version: 'v2', folders: Array.isArray(folders) ? folders.length : 0 };
  }
}

// ============================================
// Export global de la classe
// ============================================

exposeGlobal('NextcloudBookmarksAPI', NextcloudBookmarksAPI);
