/**
 * Image Preloader and Cache Manager
 * Efficiently loads and caches the 33 garden state images
 */

export interface ImageCacheEntry {
  url: string;
  blob: Blob | null;
  objectUrl: string | null;
  loaded: boolean;
  error: Error | null;
  loadTime: number;
  lastAccessed: number;
}

export interface PreloadProgress {
  total: number;
  loaded: number;
  failed: number;
  percentage: number;
}

export type PreloadProgressCallback = (progress: PreloadProgress) => void;

class ImagePreloader {
  private cache: Map<string, ImageCacheEntry> = new Map();
  private loadingPromises: Map<string, Promise<ImageCacheEntry>> = new Map();
  private readonly maxCacheSize = 50; // Maximum number of images to keep in memory
  private readonly cacheExpiryMs = 15 * 60 * 1000; // 15 minutes

  /**
   * Preload multiple images with progress tracking
   */
  public async preloadImages(
    imagePaths: string[],
    onProgress?: PreloadProgressCallback,
    priority: 'sequential' | 'parallel' | 'smart' = 'smart'
  ): Promise<ImageCacheEntry[]> {
    const total = imagePaths.length;
    let loaded = 0;
    let failed = 0;

    const updateProgress = () => {
      if (onProgress) {
        onProgress({
          total,
          loaded,
          failed,
          percentage: ((loaded + failed) / total) * 100
        });
      }
    };

    if (priority === 'sequential') {
      // Load one by one (slower but uses less bandwidth)
      const results: ImageCacheEntry[] = [];
      for (const path of imagePaths) {
        try {
          const entry = await this.loadImage(path);
          loaded++;
          results.push(entry);
        } catch (error) {
          failed++;
          results.push(this.createErrorEntry(path, error as Error));
        }
        updateProgress();
      }
      return results;
    } else if (priority === 'parallel') {
      // Load all at once (faster but uses more bandwidth)
      const promises = imagePaths.map(async (path) => {
        try {
          const entry = await this.loadImage(path);
          loaded++;
          updateProgress();
          return entry;
        } catch (error) {
          failed++;
          updateProgress();
          return this.createErrorEntry(path, error as Error);
        }
      });
      return Promise.all(promises);
    } else {
      // Smart loading: load in batches for optimal performance
      const batchSize = 3;
      const results: ImageCacheEntry[] = [];
      
      for (let i = 0; i < imagePaths.length; i += batchSize) {
        const batch = imagePaths.slice(i, i + batchSize);
        const batchPromises = batch.map(async (path) => {
          try {
            const entry = await this.loadImage(path);
            loaded++;
            updateProgress();
            return entry;
          } catch (error) {
            failed++;
            updateProgress();
            return this.createErrorEntry(path, error as Error);
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      
      return results;
    }
  }

  /**
   * Load a single image
   */
  public async loadImage(url: string): Promise<ImageCacheEntry> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached && cached.loaded && !this.isExpired(cached)) {
      cached.lastAccessed = Date.now();
      return cached;
    }

    // Check if already loading
    const loading = this.loadingPromises.get(url);
    if (loading) {
      return loading;
    }

    // Start loading
    const loadPromise = this.fetchAndCacheImage(url);
    this.loadingPromises.set(url, loadPromise);

    try {
      const result = await loadPromise;
      this.loadingPromises.delete(url);
      return result;
    } catch (error) {
      this.loadingPromises.delete(url);
      throw error;
    }
  }

  /**
   * Get image from cache without loading
   */
  public getCached(url: string): ImageCacheEntry | null {
    const cached = this.cache.get(url);
    if (cached && !this.isExpired(cached)) {
      cached.lastAccessed = Date.now();
      return cached;
    }
    return null;
  }

  /**
   * Clear specific image from cache
   */
  public clearImage(url: string): void {
    const entry = this.cache.get(url);
    if (entry?.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
    }
    this.cache.delete(url);
  }

  /**
   * Clear all cached images
   */
  public clearAll(): void {
    this.cache.forEach(entry => {
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    });
    this.cache.clear();
  }

  /**
   * Clean up expired or least recently used images
   */
  public cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());

    // Remove expired entries
    entries.forEach(([url, entry]) => {
      if (this.isExpired(entry)) {
        this.clearImage(url);
      }
    });

    // If still over limit, remove least recently used
    if (this.cache.size > this.maxCacheSize) {
      const sortedEntries = entries
        .filter(([_, entry]) => entry.loaded)
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

      const toRemove = sortedEntries.slice(0, this.cache.size - this.maxCacheSize);
      toRemove.forEach(([url]) => this.clearImage(url));
    }
  }

  /**
   * Preload garden state images specifically
   */
  public async preloadGardenStates(
    baseUrl: string = '/images/garden-states/',
    states: number[] | 'all' | 'priority' = 'priority',
    onProgress?: PreloadProgressCallback
  ): Promise<Map<number, ImageCacheEntry>> {
    let statesToLoad: number[];

    if (states === 'all') {
      // Load all 33 states
      statesToLoad = Array.from({ length: 33 }, (_, i) => i);
    } else if (states === 'priority') {
      // Load key states first (boundaries and middle)
      statesToLoad = [0, 8, 16, 24, 32, 4, 12, 20, 28];
    } else {
      statesToLoad = states;
    }

    const paths = statesToLoad.map(state => 
      `${baseUrl}state-${String(state).padStart(2, '0')}.webp`
    );

    const results = await this.preloadImages(paths, onProgress, 'smart');
    
    const stateMap = new Map<number, ImageCacheEntry>();
    statesToLoad.forEach((state, index) => {
      stateMap.set(state, results[index]);
    });

    return stateMap;
  }

  /**
   * Get optimized image URL (object URL for performance)
   */
  public async getOptimizedUrl(url: string): Promise<string> {
    const entry = await this.loadImage(url);
    return entry.objectUrl || url;
  }

  private async fetchAndCacheImage(url: string): Promise<ImageCacheEntry> {
    const startTime = Date.now();

    try {
      // Fetch the image
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      // Get blob
      const blob = await response.blob();
      
      // Create object URL for performance
      const objectUrl = URL.createObjectURL(blob);

      // Verify the image loads
      await this.verifyImage(objectUrl);

      const entry: ImageCacheEntry = {
        url,
        blob,
        objectUrl,
        loaded: true,
        error: null,
        loadTime: Date.now() - startTime,
        lastAccessed: Date.now()
      };

      this.cache.set(url, entry);
      this.cleanup(); // Clean up old entries

      return entry;
    } catch (error) {
      const entry = this.createErrorEntry(url, error as Error);
      this.cache.set(url, entry);
      throw error;
    }
  }

  private verifyImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = url;
    });
  }

  private createErrorEntry(url: string, error: Error): ImageCacheEntry {
    return {
      url,
      blob: null,
      objectUrl: null,
      loaded: false,
      error,
      loadTime: 0,
      lastAccessed: Date.now()
    };
  }

  private isExpired(entry: ImageCacheEntry): boolean {
    return Date.now() - entry.lastAccessed > this.cacheExpiryMs;
  }
}

// Export singleton instance
export const imagePreloader = new ImagePreloader();

// Export convenience functions
export async function preloadGardenImages(
  currentState: number,
  onProgress?: PreloadProgressCallback
): Promise<void> {
  // Load current state and nearby states
  const nearbyStates = [
    currentState,
    Math.max(0, currentState - 2),
    Math.max(0, currentState - 1),
    Math.min(32, currentState + 1),
    Math.min(32, currentState + 2)
  ];

  await imagePreloader.preloadGardenStates(
    '/images/garden-states/',
    nearbyStates,
    onProgress
  );
}

export function cleanupImageCache(): void {
  imagePreloader.cleanup();
}

export default imagePreloader;