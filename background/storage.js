// ============================================
// Gestion du stockage local (IndexedDB)
// ============================================

const DB_NAME = 'NextcloudBookmarksDB';
const DB_VERSION = 2; // Mise à jour pour ajouter le store des logs
const STORE_NAME = 'bookmarks';
const METADATA_STORE = 'metadata';
const LOGS_STORE = 'logs';

let db;
let dbPromise = null;

// Ouvre ou crée la base de données IndexedDB
async function openDB() {
  // Utiliser une promesse memoized pour éviter d'ouvrir plusieurs fois
  if (dbPromise) {
    return dbPromise;
  }
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Erreur ouverture IndexedDB:', event.target.error);
      dbPromise = null;
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      dbPromise = Promise.resolve(db);
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(LOGS_STORE)) {
        db.createObjectStore(LOGS_STORE, { keyPath: 'timestamp', autoIncrement: true });
      }
    };
  });
  
  return dbPromise;
}

// Sauvegarde un marque-page localement
async function saveBookmarkLocal(bookmark) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(bookmark);

    request.onsuccess = () => resolve(bookmark);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Récupère un marque-page par ID
async function getBookmarkLocal(id) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Récupère tous les marques-pages locaux
async function getAllBookmarksLocal() {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Supprime un marque-page local
async function deleteBookmarkLocal(id) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Sauvegarde les métadonnées (ex: last_sync)
async function saveMetadata(key, value) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve(value);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Récupère une métadonnée
async function getMetadata(key) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result ? request.result.value : null);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

// Efface toutes les données locales
async function clearAllLocalData() {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, METADATA_STORE, LOGS_STORE], 'readwrite');
    const store1 = transaction.objectStore(STORE_NAME);
    const store2 = transaction.objectStore(METADATA_STORE);
    const store3 = transaction.objectStore(LOGS_STORE);
    
    store1.clear();
    store2.clear();
    store3.clear();

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = (event) => reject(event.target.error);
  });
}

// ============================================
// Cache des marque-pages
// ============================================

// Sauvegarde un marque-page dans le cache
async function saveBookmarkToCache(bookmark) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(bookmark);

    request.onsuccess = () => resolve(bookmark);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Récupère un marque-page du cache
async function getBookmarkFromCache(id) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Récupère tous les marque-pages du cache
async function getAllBookmarksFromCache() {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Supprime un marque-page du cache
async function deleteBookmarkFromCache(id) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Efface le cache des marque-pages
async function clearBookmarksCache() {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = (event) => reject(event.target.error);
  });
}

// ============================================
// Cache des logs
// ============================================

// Sauvegarde un log dans IndexedDB
async function saveLogToCache(logEntry) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOGS_STORE, 'readwrite');
    const store = transaction.objectStore(LOGS_STORE);
    const request = store.add(logEntry);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Récupère les logs du cache
async function getLogsFromCache(limit = 100) {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOGS_STORE, 'readonly');
    const store = transaction.objectStore(LOGS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      // Retourne les logs les plus récents
      const logs = request.result;
      resolve(logs.slice(-limit));
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

// Efface le cache des logs
async function clearLogsCache() {
  await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOGS_STORE, 'readwrite');
    const store = transaction.objectStore(LOGS_STORE);
    store.clear();

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = (event) => reject(event.target.error);
  });
}

// Les fonctions sont disponibles globalement grâce au chargement via manifest.json > background.scripts
