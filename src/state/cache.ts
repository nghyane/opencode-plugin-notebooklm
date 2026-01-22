/**
 * Lightweight Cache
 * 
 * Minimal overhead - chỉ cache normalized data
 * Không cache raw responses, chỉ cache kết quả đã chuẩn hóa
 */

// ============================================================================
// Cache Config
// ============================================================================

const DEFAULT_TTL = 60_000; // 1 minute

const TTL_CONFIG: Record<string, number> = {
  notebooks: 120_000,     // 2 min - list rarely changes
  notebook: 180_000,      // 3 min - notebook structure stable
  source: 300_000,        // 5 min - source content doesn't change
  query: 120_000,         // 2 min - same query = same answer
};

// ============================================================================
// Simple Map Cache (no LRU overhead for small dataset)
// ============================================================================

interface Entry<T> {
  v: T;      // value
  e: number; // expires timestamp
}

const store = new Map<string, Entry<unknown>>();

// ============================================================================
// Core Operations
// ============================================================================

export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  
  if (Date.now() > entry.e) {
    store.delete(key);
    return undefined;
  }
  
  return entry.v as T;
}

export function set<T>(key: string, value: T, ttlKey?: string): void {
  const ttl = TTL_CONFIG[ttlKey || ""] || DEFAULT_TTL;
  store.set(key, { v: value, e: Date.now() + ttl });
}

export function del(pattern: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(pattern)) {
      store.delete(key);
    }
  }
}

export function clear(): void {
  store.clear();
}

// ============================================================================
// Key Generators (short, consistent)
// ============================================================================

export const key = {
  notebooks: () => "nbs",
  notebook: (id: string) => `nb:${id}`,
  source: (id: string) => `src:${id}`,
  query: (nbId: string, q: string) => `q:${nbId}:${hash(q)}`,
};

// Simple string hash for query dedup
function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// ============================================================================
// Stats (debug only)
// ============================================================================

export function stats(): { size: number } {
  return { size: store.size };
}

// ============================================================================
// Periodic Cleanup (sweep expired entries)
// ============================================================================

export function sweep(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of store.entries()) {
    if (now > entry.e) {
      store.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

// Auto-sweep every 5 minutes (if module stays loaded)
let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSweep(intervalMs: number = 5 * 60 * 1000): void {
  if (sweepInterval) return;
  sweepInterval = setInterval(sweep, intervalMs);
}

export function stopAutoSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}
