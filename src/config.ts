/**
 * Centralized configuration
 */

export const Config = {
  // Base URLs
  BASE_URL: "https://notebooklm.google.com",
  BATCHEXECUTE_URL: "https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute",
  QUERY_ENDPOINT: "/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed",
  
  // Backend label - update when Google changes it
  BL: process.env['NOTEBOOKLM_BL'] || "boq_labs-tailwind-frontend_20260120.08_p0",
  
  // CDP (Chrome DevTools Protocol) settings - ENABLED by default for personal use
  CDP_ENABLED: process.env['NOTEBOOKLM_CDP_ENABLED'] !== 'false' && process.env['NOTEBOOKLM_CDP_ENABLED'] !== '0',
  CDP_PORT: parseInt(process.env['NOTEBOOKLM_CDP_PORT'] || '9222', 10),
  
  // Browser selection: chrome, edge, brave (or explicit path)
  CDP_BROWSER: process.env['NOTEBOOKLM_CDP_BROWSER'] as 'chrome' | 'edge' | 'brave' | undefined,
  CDP_BROWSER_PATH: process.env['NOTEBOOKLM_CDP_BROWSER_PATH'],
  // Comma-separated preference order, e.g., "edge,chrome,brave"
  CDP_BROWSER_PREFERENCE: process.env['NOTEBOOKLM_CDP_BROWSER_PREFERENCE']?.split(',').filter(Boolean) as ('chrome' | 'edge' | 'brave')[] | undefined,
  
  // Headers
  USER_AGENT: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  
  PAGE_FETCH_HEADERS: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
  },
  
  RPC_HEADERS: {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    "X-Same-Domain": "1",
    "x-goog-ext-353267353-jspb": "[null,null,null,282611]",
    "priority": "u=1, i",
  },
  
  // Timeouts (ms)
  DEFAULT_TIMEOUT: 30000,
  SOURCE_ADD_TIMEOUT: 120000,
  QUERY_TIMEOUT: 120000,
  
  // Cache directory
  CACHE_DIR: ".notebooklm-mcp",
} as const;

// Re-export RPC_IDS and other constants from types.ts
export { RPC_IDS, CONSTANTS } from "./types";
