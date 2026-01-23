/**
 * CDP Browser Resolver - auto-detect and resolve browser executable
 */

import { existsSync } from "fs";
import { type BrowserId, type BrowserDescriptor, BROWSER_REGISTRY, DEFAULT_BROWSER_PREFERENCE } from "./cdp-browsers";

export interface ResolvedBrowser {
  id: BrowserId;
  displayName: string;
  executablePath: string;
}

export interface BrowserResolveConfig {
  preferredBrowser?: BrowserId | undefined;
  browserPreference?: BrowserId[] | undefined;
  explicitPath?: string | undefined;
}

/**
 * Find executable path for a browser on current platform
 */
function findBrowserPath(browser: BrowserDescriptor): string | null {
  const platform = process.platform as "darwin" | "win32" | "linux";
  const paths = browser.platformPaths[platform] || [];

  // Check explicit paths first
  for (const p of paths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Check PATH using Bun.which
  for (const name of browser.pathNames) {
    const found = Bun.which(name);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Check if a specific browser is installed
 */
export function isBrowserInstalled(browserId: BrowserId): boolean {
  const browser = BROWSER_REGISTRY[browserId];
  return browser ? findBrowserPath(browser) !== null : false;
}

/**
 * List all installed browsers
 */
export function listInstalledBrowsers(): ResolvedBrowser[] {
  const installed: ResolvedBrowser[] = [];

  for (const browser of Object.values(BROWSER_REGISTRY)) {
    const path = findBrowserPath(browser);
    if (path) {
      installed.push({
        id: browser.id,
        displayName: browser.displayName,
        executablePath: path,
      });
    }
  }

  return installed;
}

/**
 * Resolve browser to use based on config and availability
 * 
 * Priority:
 * 1. Explicit path (if provided and exists)
 * 2. Preferred browser (if installed)
 * 3. Browser preference list (first installed)
 * 4. Default preference order (chrome → edge → brave)
 */
export function resolveBrowser(config: BrowserResolveConfig = {}): ResolvedBrowser | null {
  // 1. Explicit path override
  if (config.explicitPath && existsSync(config.explicitPath)) {
    // Try to identify which browser it is
    const lowerPath = config.explicitPath.toLowerCase();
    let id: BrowserId = "chrome"; // default
    if (lowerPath.includes("edge") || lowerPath.includes("msedge")) {
      id = "edge";
    } else if (lowerPath.includes("brave")) {
      id = "brave";
    }
    return {
      id,
      displayName: BROWSER_REGISTRY[id].displayName,
      executablePath: config.explicitPath,
    };
  }

  // 2. Single preferred browser
  if (config.preferredBrowser) {
    const browser = BROWSER_REGISTRY[config.preferredBrowser];
    if (browser) {
      const path = findBrowserPath(browser);
      if (path) {
        return {
          id: browser.id,
          displayName: browser.displayName,
          executablePath: path,
        };
      }
    }
  }

  // 3. Browser preference list
  const preference = config.browserPreference || DEFAULT_BROWSER_PREFERENCE;
  for (const browserId of preference) {
    const browser = BROWSER_REGISTRY[browserId];
    if (browser) {
      const path = findBrowserPath(browser);
      if (path) {
        return {
          id: browser.id,
          displayName: browser.displayName,
          executablePath: path,
        };
      }
    }
  }

  return null;
}

/**
 * Get user data directory for a browser
 * Each browser gets its own profile to avoid conflicts
 */
export function getBrowserDataDir(browserId: BrowserId): string {
  return `${process.env["HOME"]}/.notebooklm-mcp/cdp-profile/${browserId}`;
}
