// Polyfill pour Firefox - Compatibilité browser/chrome API
// Firefox utilise 'browser' mais supporte aussi 'chrome' pour la compatibilité
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  window.browser = window.chrome;
} else if (typeof browser === 'undefined') {
  // Fallback pour les navigateurs qui n'ont ni l'un ni l'autre
  console.error('Nextcloud Bookmarks Sync: Ni browser ni chrome API disponible');
}
