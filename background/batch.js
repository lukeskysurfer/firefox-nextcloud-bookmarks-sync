// ============================================
// Batch Processor - Traitement par lots pour éviter de bloquer l'UI
// ============================================

/**
 * Configuration du batch processing
 */
let BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 50,      // Nombre d'éléments par lot
  DEFAULT_DELAY_MS: 10,       // Délai entre les lots (ms)
  MAX_CONCURRENT_OPERATIONS: 5, // Opérations concurrentes max
  YIELD_INTERVAL: 100         // Intervalle pour céder le contrôle à l'UI (ms)
};

/**
 * Met à jour la configuration à partir des paramètres
 */
async function updateBatchConfig() {
  try {
    const settings = await browser.storage.local.get(['batchSize']);
    if (settings.batchSize) {
      BATCH_CONFIG.DEFAULT_BATCH_SIZE = parseInt(settings.batchSize);
      NCBookmarksLogger?.info(`Batch size mis à jour: ${BATCH_CONFIG.DEFAULT_BATCH_SIZE}`);
    }
  } catch (error) {
    NCBookmarksLogger?.error('Erreur mise à jour config batch:', { error: error.message });
  }
}

/**
 * État du batch processor
 */
let batchState = {
  isProcessing: false,
  currentBatch: 0,
  totalBatches: 0,
  processedCount: 0,
  totalCount: 0,
  errors: []
};

/**
 * Réinitialise l'état du batch
 */
function resetBatchState() {
  batchState = {
    isProcessing: false,
    currentBatch: 0,
    totalBatches: 0,
    processedCount: 0,
    totalCount: 0,
    errors: []
  };
}

/**
 * Céder le contrôle à l'UI pour éviter de bloquer
 */
async function yieldToUI() {
  return new Promise(resolve => {
    setTimeout(resolve, BATCH_CONFIG.YIELD_INTERVAL);
  });
}

/**
 * Exécute une fonction avec un délai si nécessaire
 */
async function runWithBackoff(fn, attempt = 1, maxAttempts = 3) {
  try {
    return await fn();
  } catch (error) {
    if (attempt >= maxAttempts) {
      throw error;
    }
    
    // Délai exponentiel
    const delay = Math.pow(2, attempt) * 100;
    NCBookmarksLogger?.warn(`Tentative ${attempt} échouée, retry dans ${delay}ms: ${error.message}`);
    await yieldToUI();
    await new Promise(resolve => setTimeout(resolve, delay));
    return runWithBackoff(fn, attempt + 1, maxAttempts);
  }
}

/**
 * Traite un lot d'opérations
 * @param {Array} items - Tableau d'éléments à traiter
 * @param {Function} processor - Fonction qui traite un élément
 * @param {Object} options - Options de batch
 * @returns {Object} - Statistiques de traitement
 */
async function processBatch(items, processor, options = {}) {
  const {
    batchSize = BATCH_CONFIG.DEFAULT_BATCH_SIZE,
    delayMs = BATCH_CONFIG.DEFAULT_DELAY_MS,
    maxConcurrent = BATCH_CONFIG.MAX_CONCURRENT_OPERATIONS,
    onBatchDone = null // appelé avec le nombre d'éléments traités après chaque lot (pour la progression)
  } = options;
  
  const totalCount = items.length;
  const totalBatches = Math.ceil(totalCount / batchSize);
  const stats = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  NCBookmarksLogger?.info(`Début traitement par lots: ${totalCount} éléments, ${totalBatches} lots`);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, totalCount);
    const batch = items.slice(startIndex, endIndex);
    
    NCBookmarksLogger?.debug(`Traitement lot ${batchIndex + 1}/${totalBatches} (${batch.length} éléments)`);
    
    // Traite le lot avec concurrency limitée
    const batchPromises = [];
    
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      
      // Limite la concurrency
      if (batchPromises.length >= maxConcurrent) {
        await Promise.any(batchPromises);
      }
      
      const promise = runWithBackoff(async () => {
        try {
          await processor(item, batchIndex, i);
          stats.success++;
        } catch (error) {
          stats.failed++;
          stats.errors.push({ item, error: error.message, batch: batchIndex });
          NCBookmarksLogger?.error(`Erreur traitement élément: ${error.message}`);
        }
      }).catch(() => {
        // L'erreur est déjà gérée dans runWithBackoff
      });
      
      batchPromises.push(promise);
    }
    
    // Attend la fin du lot
    await Promise.all(batchPromises);

    if (onBatchDone) {
      try { onBatchDone(batch.length); } catch (e) { /* ignore */ }
    }

    // Délai entre les lots pour éviter de surcharger
    if (batchIndex < totalBatches - 1) {
      await yieldToUI();
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  NCBookmarksLogger?.info(`Traitement terminé: ${stats.success} succès, ${stats.failed} échecs`);
  return stats;
}

/**
 * Traite des opérations asynchronously avec un délai entre chaque
 */
async function processSequentially(items, processor, options = {}) {
  const { delayMs = BATCH_CONFIG.DEFAULT_DELAY_MS } = options;
  const stats = { success: 0, failed: 0, errors: [] };
  
  for (let i = 0; i < items.length; i++) {
    try {
      await processor(items[i], i);
      stats.success++;
    } catch (error) {
      stats.failed++;
      stats.errors.push({ item: items[i], error: error.message, index: i });
      NCBookmarksLogger?.error(`Erreur séquence ${i}: ${error.message}`);
    }
    
    // Délai entre chaque opération
    if (i < items.length - 1) {
      await yieldToUI();
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return stats;
}

/**
 * Crée un itérateur batch pour les grandes collections
 */
function createBatchIterator(items, batchSize = BATCH_CONFIG.DEFAULT_BATCH_SIZE) {
  let index = 0;
  const total = items.length;
  
  return {
    next: () => {
      if (index >= total) {
        return { done: true, value: [] };
      }
      
      const start = index;
      const end = Math.min(index + batchSize, total);
      index = end;
      
      return {
        done: false,
        value: items.slice(start, end),
        batchIndex: Math.floor(start / batchSize),
        totalBatches: Math.ceil(total / batchSize)
      };
    },
    reset: () => { index = 0; },
    get progress() {
      return { current: index, total, percent: Math.round((index / total) * 100) };
    }
  };
}

/**
 * Exécute une opération avec suivi de progression
 */
async function executeWithProgress(items, processor, options = {}) {
  const {
    batchSize = BATCH_CONFIG.DEFAULT_BATCH_SIZE,
    onProgress = null
  } = options;
  
  const iterator = createBatchIterator(items, batchSize);
  const stats = { success: 0, failed: 0, errors: [] };
  
  while (true) {
    const { done, value: batch, batchIndex, totalBatches } = iterator.next();
    
    if (done) break;
    
    // Traite chaque élément du batch
    for (const item of batch) {
      try {
        await processor(item);
        stats.success++;
      } catch (error) {
        stats.failed++;
        stats.errors.push({ item, error: error.message });
      }
    }
    
    // Appelle le callback de progression
    if (onProgress) {
      onProgress({
        ...iterator.progress,
        batch: batchIndex + 1,
        totalBatches,
        stats
      });
    }
    
    // Céder le contrôle
    await yieldToUI();
  }
  
  return stats;
}

/**
 * Estime le temps restant basé sur la vitesse de traitement
 */
function estimateTimeRemaining(startTime, processedCount, totalCount) {
  const elapsed = Date.now() - startTime;
  if (elapsed === 0 || processedCount === 0) return 0;
  
  const speed = processedCount / elapsed; // éléments/ms
  const remaining = totalCount - processedCount;
  const estimatedMs = remaining / speed;
  
  return Math.round(estimatedMs / 1000); // en secondes
}

// ============================================
// Export global
// ============================================

exposeGlobal('NCBookmarksBatch', {
  BATCH_CONFIG,
  batchState,
  resetBatchState,
  yieldToUI,
  runWithBackoff,
  processBatch,
  processSequentially,
  createBatchIterator,
  executeWithProgress,
  estimateTimeRemaining
});
