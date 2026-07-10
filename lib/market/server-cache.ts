type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
};

const globalMarketCache = globalThis as typeof globalThis & {
  __watchlistMarketCache?: Map<string, CacheEntry<unknown>>;
};

const marketCache =
  globalMarketCache.__watchlistMarketCache ?? new Map<string, CacheEntry<unknown>>();

globalMarketCache.__watchlistMarketCache = marketCache;

export async function withSharedMarketCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const current = marketCache.get(key) as CacheEntry<T> | undefined;

  if (current?.value !== undefined && current.expiresAt > now) {
    return current.value;
  }

  if (current?.pending) {
    return current.pending;
  }

  const pending = loader()
    .then((value) => {
      marketCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
      trimCache();
      return value;
    })
    .catch((error) => {
      if (current?.value !== undefined) {
        marketCache.set(key, {
          value: current.value,
          expiresAt: Date.now() + Math.min(ttlMs, 15_000)
        });
        return current.value;
      }

      marketCache.delete(key);
      throw error;
    });

  marketCache.set(key, {
    value: current?.value,
    expiresAt: current?.expiresAt ?? 0,
    pending
  });

  return pending;
}

function trimCache() {
  if (marketCache.size <= 100) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of marketCache) {
    if (!entry.pending && entry.expiresAt <= now) {
      marketCache.delete(key);
    }
  }

  while (marketCache.size > 100) {
    const oldestKey = marketCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    marketCache.delete(oldestKey);
  }
}
