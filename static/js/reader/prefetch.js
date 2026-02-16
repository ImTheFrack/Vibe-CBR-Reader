export class PrefetchManager {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 8;
    this.loadingUrls = new Set();
  }

  async prefetch(url) {
    if (this.cache.has(url) || this.loadingUrls.has(url)) return;
    if (this.cache.size >= this.maxCacheSize) this.enforceCacheLimit();

    this.loadingUrls.add(url);
    try {
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        setTimeout(resolve, 5000);
      });
      this.cache.set(url, img);
    } catch (e) {
      console.warn(`Failed to prefetch: ${url}`, e);
    } finally {
      this.loadingUrls.delete(url);
    }
  }

  enforceCacheLimit() {
    while (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  getCachedImage(url) {
    return this.cache.get(url);
  }

  clear() {
    this.cache.clear();
    this.loadingUrls.clear();
  }
}

export const prefetchManager = new PrefetchManager();
