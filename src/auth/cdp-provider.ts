/**
 * CDP (Chrome DevTools Protocol) Auth Provider
 * Supports multiple browsers: Chrome, Edge, Brave
 * 
 * Uses official types from @types/chrome-remote-interface which re-exports
 * devtools-protocol types.
 */

import type { Client as CDPClient } from "chrome-remote-interface";
import {
  saveTokensToCache,
  extractCsrfFromHtml,
  extractSessionIdFromHtml,
  type AuthTokens,
  REQUIRED_COOKIES,
} from "./tokens";
import { resolveBrowser, getBrowserDataDir, listInstalledBrowsers, type ResolvedBrowser } from "./cdp-resolver";
import { Config } from "../config";

const NOTEBOOKLM_URL = "https://notebooklm.google.com";
const DEFAULT_CDP_PORT = 9222;

export interface CDPConfig {
  port?: number;
  host?: string;
}

// Cached resolved browser
let _resolvedBrowser: ResolvedBrowser | null = null;

/**
 * Get the resolved browser (with caching)
 */
function getResolvedBrowser(): ResolvedBrowser | null {
  if (!_resolvedBrowser) {
    _resolvedBrowser = resolveBrowser({
      preferredBrowser: Config.CDP_BROWSER,
      browserPreference: Config.CDP_BROWSER_PREFERENCE,
      explicitPath: Config.CDP_BROWSER_PATH,
    });
  }
  return _resolvedBrowser;
}

/**
 * Dynamic import for CDP (require for CJS compatibility)
 */
async function connectCDP(port: number, host: string): Promise<CDPClient> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CDPModule = require("chrome-remote-interface");
  return CDPModule({ port, host });
}

/**
 * Check if browser is running with debugging port
 */
export async function isCDPAvailable(config: CDPConfig = {}): Promise<boolean> {
  const port = config.port ?? DEFAULT_CDP_PORT;
  const host = config.host ?? "localhost";

  try {
    const response = await fetch(`http://${host}:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get browser launch command for the user
 */
export function getBrowserDebugCommand(port = DEFAULT_CDP_PORT): string {
  const browser = getResolvedBrowser();
  
  if (!browser) {
    return "No compatible browser found. Install Chrome, Edge, or Brave.";
  }

  const userDataDir = getBrowserDataDir(browser.id);
  const escapedPath = browser.executablePath.replace(/ /g, "\\ ");
  
  return `${escapedPath} --remote-debugging-port=${port} --user-data-dir="${userDataDir}"`;
}

/**
 * Get info about resolved browser
 */
export function getResolvedBrowserInfo(): { name: string; path: string } | null {
  const browser = getResolvedBrowser();
  if (!browser) return null;
  return { name: browser.displayName, path: browser.executablePath };
}

/**
 * List all installed compatible browsers
 */
export function getInstalledBrowsers(): Array<{ id: string; name: string; path: string }> {
  return listInstalledBrowsers().map(b => ({
    id: b.id,
    name: b.displayName,
    path: b.executablePath,
  }));
}

/**
 * Launch browser with CDP debugging port enabled
 */
export async function launchBrowserWithCDP(port = DEFAULT_CDP_PORT): Promise<boolean> {
  const browser = getResolvedBrowser();
  
  if (!browser) {
    console.error("No compatible browser found.");
    console.log("Installed browsers:", listInstalledBrowsers().map(b => b.displayName).join(", ") || "none");
    return false;
  }

  const userDataDir = getBrowserDataDir(browser.id);

  try {
    console.log(`Launching ${browser.displayName}...`);
    const proc = Bun.spawn([
      browser.executablePath,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      NOTEBOOKLM_URL,
    ], {
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();

    // Wait for CDP to become available (max 30s)
    for (let i = 0; i < 30; i++) {
      await Bun.sleep(1000);
      if (await isCDPAvailable({ port })) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error(`Failed to launch ${browser.displayName}:`, error);
    return false;
  }
}

/**
 * Extract cookies from running browser via CDP
 */
export async function extractCookiesViaCDP(
  config: CDPConfig = {}
): Promise<Record<string, string> | null> {
  const port = config.port ?? DEFAULT_CDP_PORT;
  const host = config.host ?? "localhost";

  let client: CDPClient | null = null;

  try {
    client = await connectCDP(port, host);
    const { Network } = client;
    await Network.enable({});

    const { cookies } = await Network.getCookies({
      urls: [NOTEBOOKLM_URL],
    });

    const cookieMap: Record<string, string> = {};
    for (const cookie of cookies) {
      cookieMap[cookie.name] = cookie.value;
    }

    // Check if required cookies are present
    const hasRequired = REQUIRED_COOKIES.every((name) => name in cookieMap);
    if (!hasRequired) {
      console.warn("CDP: Missing required cookies. User may need to login to NotebookLM.");
      return null;
    }

    return cookieMap;
  } catch (error) {
    console.error("CDP connection failed:", error);
    return null;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Extract CSRF token and Session ID by navigating to NotebookLM page
 */
export async function extractTokensViaCDP(
  config: CDPConfig = {}
): Promise<{ csrfToken: string; sessionId: string } | null> {
  const port = config.port ?? DEFAULT_CDP_PORT;
  const host = config.host ?? "localhost";

  let client: CDPClient | null = null;

  try {
    client = await connectCDP(port, host);
    const { Page, Runtime } = client;
    await Page.enable();
    await Runtime.enable();

    // Navigate to NotebookLM
    await Page.navigate({ url: NOTEBOOKLM_URL });
    await Page.loadEventFired();

    // Wait a bit for dynamic content
    await Bun.sleep(2000);

    // Get page HTML
    const { result } = await Runtime.evaluate({
      expression: "document.documentElement.outerHTML",
    });

    const html = result.value as string;
    const csrfToken = extractCsrfFromHtml(html);
    const sessionId = extractSessionIdFromHtml(html);

    if (!csrfToken) {
      console.warn("CDP: Could not extract CSRF token");
      return null;
    }

    return {
      csrfToken,
      sessionId: sessionId || "",
    };
  } catch (error) {
    console.error("CDP token extraction failed:", error);
    return null;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Full auth refresh via CDP - cookies + CSRF + session ID
 */
export async function refreshAuthViaCDP(
  config: CDPConfig = {}
): Promise<AuthTokens | null> {
  const browser = getResolvedBrowser();
  
  // Try to connect, or launch browser if not available
  if (!(await isCDPAvailable(config))) {
    if (!browser) {
      console.warn("No compatible browser found for CDP auth.");
      console.log("Install Chrome, Edge, or Brave, or use save_auth_tokens manually.");
      return null;
    }
    
    console.log(`CDP not available. Launching ${browser.displayName}...`);
    const launched = await launchBrowserWithCDP(config.port);
    if (!launched) {
      console.warn(`Failed to launch ${browser.displayName}. Please launch manually:`);
      console.warn(getBrowserDebugCommand(config.port));
      return null;
    }
    console.log(`${browser.displayName} launched. Please login to NotebookLM if needed.`);
    // Give user time to login (check for cookies every 5s, max 2 min)
    for (let i = 0; i < 24; i++) {
      await Bun.sleep(5000);
      const cookies = await extractCookiesViaCDP(config);
      if (cookies) {
        console.log("Login detected!");
        break;
      }
    }
  }

  // Extract cookies
  const cookies = await extractCookiesViaCDP(config);
  if (!cookies) {
    return null;
  }

  // Extract CSRF and session ID
  const tokens = await extractTokensViaCDP(config);
  if (!tokens) {
    return null;
  }

  const authTokens: AuthTokens = {
    cookies,
    csrfToken: tokens.csrfToken,
    sessionId: tokens.sessionId,
    extractedAt: Date.now() / 1000,
  };

  // Save to cache
  saveTokensToCache(authTokens, true);
  const browserName = browser?.displayName || "Browser";
  console.log(`CDP: Auth tokens refreshed successfully via ${browserName}`);

  return authTokens;
}


