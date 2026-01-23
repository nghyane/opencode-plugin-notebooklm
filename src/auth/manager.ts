/**
 * AuthManager - Singleton for centralized auth management
 * 
 * Features:
 * - In-memory token cache (avoids disk I/O on every request)
 * - Proactive refresh before expiry
 * - 4-layer recovery: CSRF refresh → disk reload → CDP → manual
 * - CDP opt-in flag
 * - Mutex to prevent concurrent refresh storms
 */

import { chmodSync } from "fs";
import {
  loadCachedTokens,
  saveTokensToCache,
  validateCookies,
  isTokenExpired,
  extractCsrfFromHtml,
  extractSessionIdFromHtml,
  cookiesToHeader,
  getCachePath,
  type AuthTokens,
} from "./tokens";
import {
  refreshAuthViaCDP,
  isCDPAvailable,
  getBrowserDebugCommand,
} from "./cdp-provider";
import { Config } from "../config";

// CSRF expires faster than cookies (4 hours)
const CSRF_TTL_MS = 4 * 60 * 60 * 1000;
// Proactive refresh 30 min before expiry
const PROACTIVE_REFRESH_BUFFER_MS = 30 * 60 * 1000;

export interface AuthManagerConfig {
  cdpEnabled: boolean;  // Opt-in for CDP auto-launch
  cdpPort: number;
}

// Read from environment or use defaults
const DEFAULT_CONFIG: AuthManagerConfig = {
  cdpEnabled: Config.CDP_ENABLED,
  cdpPort: Config.CDP_PORT,
};

type AuthState = 
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; tokens: AuthTokens; csrfRefreshedAt: number }
  | { status: 'expired'; tokens: AuthTokens };

class AuthManager {
  private static instance: AuthManager | null = null;
  
  private state: AuthState = { status: 'unauthenticated' };
  private config: AuthManagerConfig = DEFAULT_CONFIG;
  private refreshMutex: Promise<boolean> | null = null;
  private listeners: Set<(state: AuthState) => void> = new Set();

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  configure(config: Partial<AuthManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AuthManagerConfig {
    return { ...this.config };
  }

  enableCDP(enabled = true): void {
    this.config.cdpEnabled = enabled;
  }

  // ============================================================================
  // State Management
  // ============================================================================

  getState(): AuthState {
    return this.state;
  }

  isAuthenticated(): boolean {
    return this.state.status === 'authenticated';
  }

  getTokens(): AuthTokens | null {
    if (this.state.status === 'authenticated' || this.state.status === 'expired') {
      return this.state.tokens;
    }
    return null;
  }

  getCookieHeader(): string | null {
    const tokens = this.getTokens();
    return tokens ? cookiesToHeader(tokens.cookies) : null;
  }

  getCsrfToken(): string | null {
    const tokens = this.getTokens();
    return tokens?.csrfToken ?? null;
  }

  getSessionId(): string | null {
    const tokens = this.getTokens();
    return tokens?.sessionId ?? null;
  }

  // Subscribe to state changes
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(newState: AuthState): void {
    this.state = newState;
    for (const listener of this.listeners) {
      try {
        listener(newState);
      } catch (e) {
        console.error('Auth listener error:', e);
      }
    }
  }

  // ============================================================================
  // Initialization & Loading
  // ============================================================================

  /**
   * Initialize from disk cache
   * Call this on session start
   */
  async initialize(): Promise<boolean> {
    const tokens = loadCachedTokens();
    
    if (!tokens) {
      this.setState({ status: 'unauthenticated' });
      return false;
    }

    if (!validateCookies(tokens.cookies)) {
      this.setState({ status: 'unauthenticated' });
      return false;
    }

    if (isTokenExpired(tokens)) {
      this.setState({ status: 'expired', tokens });
      // Try to refresh
      return this.refresh();
    }

    this.setState({
      status: 'authenticated',
      tokens,
      csrfRefreshedAt: tokens.extractedAt * 1000,
    });

    return true;
  }

  /**
   * Save tokens from manual input (save_auth_tokens tool)
   */
  async saveManualTokens(cookies: Record<string, string>, csrfToken?: string, sessionId?: string): Promise<boolean> {
    if (!validateCookies(cookies)) {
      return false;
    }

    const tokens: AuthTokens = {
      cookies,
      csrfToken: csrfToken ?? '',
      sessionId: sessionId ?? '',
      extractedAt: Date.now() / 1000,
    };

    // Save to disk with secure permissions
    saveTokensToCache(tokens, true);
    this.setSecurePermissions();

    this.setState({
      status: 'authenticated',
      tokens,
      csrfRefreshedAt: Date.now(),
    });

    // If no CSRF token provided, try to fetch it
    if (!csrfToken) {
      await this.refreshCsrf();
    }

    return true;
  }

  // ============================================================================
  // Token Refresh
  // ============================================================================

  /**
   * Check if CSRF needs refresh (proactive)
   */
  needsCsrfRefresh(): boolean {
    if (this.state.status !== 'authenticated') return false;
    
    const age = Date.now() - this.state.csrfRefreshedAt;
    return age > (CSRF_TTL_MS - PROACTIVE_REFRESH_BUFFER_MS);
  }

  /**
   * Proactive check - call before making requests
   */
  async ensureValid(): Promise<boolean> {
    // Not authenticated - try to initialize from disk, then CDP if needed
    if (this.state.status === 'unauthenticated') {
      const initialized = await this.initialize();
      if (initialized) return true;
      // Disk empty/invalid - try CDP refresh
      return this.refresh();
    }

    // Expired - need full refresh
    if (this.state.status === 'expired') {
      return this.refresh();
    }

    // Check if CSRF needs proactive refresh
    if (this.needsCsrfRefresh()) {
      await this.refreshCsrf();
    }

    return this.isAuthenticated();
  }

  /**
   * Refresh CSRF token only (fast, no CDP)
   */
  async refreshCsrf(): Promise<boolean> {
    const tokens = this.getTokens();
    if (!tokens) return false;

    try {
      const response = await fetch('https://notebooklm.google.com/', {
        headers: {
          'Cookie': cookiesToHeader(tokens.cookies),
        },
      });

      if (!response.ok) return false;

      const html = await response.text();
      const csrfToken = extractCsrfFromHtml(html);
      const sessionId = extractSessionIdFromHtml(html);

      if (!csrfToken) return false;

      const updatedTokens: AuthTokens = {
        ...tokens,
        csrfToken,
        sessionId: sessionId ?? tokens.sessionId,
      };

      // Update in-memory state
      this.setState({
        status: 'authenticated',
        tokens: updatedTokens,
        csrfRefreshedAt: Date.now(),
      });

      // Persist to disk
      saveTokensToCache(updatedTokens, true);

      return true;
    } catch (e) {
      console.error('CSRF refresh failed:', e);
      return false;
    }
  }

  /**
   * Full refresh with 4-layer recovery
   * Uses mutex to prevent concurrent refreshes
   */
  async refresh(): Promise<boolean> {
    // Return existing refresh if in progress
    if (this.refreshMutex) {
      return this.refreshMutex;
    }

    this.refreshMutex = this.doRefresh();
    
    try {
      return await this.refreshMutex;
    } finally {
      this.refreshMutex = null;
    }
  }

  private async doRefresh(): Promise<boolean> {
    // Layer 1: Try CSRF refresh
    if (await this.refreshCsrf()) {
      return true;
    }

    // Layer 2: Reload from disk (might have been updated by another process)
    const diskTokens = loadCachedTokens();
    if (diskTokens && validateCookies(diskTokens.cookies) && !isTokenExpired(diskTokens)) {
      this.setState({
        status: 'authenticated',
        tokens: diskTokens,
        csrfRefreshedAt: diskTokens.extractedAt * 1000,
      });
      // Try CSRF refresh with reloaded tokens
      await this.refreshCsrf();
      return true;
    }

    // Layer 3: CDP refresh (if enabled)
    if (this.config.cdpEnabled) {
      const cdpTokens = await refreshAuthViaCDP({ port: this.config.cdpPort });
      if (cdpTokens) {
        this.setState({
          status: 'authenticated',
          tokens: cdpTokens,
          csrfRefreshedAt: Date.now(),
        });
        this.setSecurePermissions();
        return true;
      }
    } else {
      // CDP not enabled - check if available and suggest
      const cdpAvailable = await isCDPAvailable({ port: this.config.cdpPort });
      if (cdpAvailable) {
        console.log('CDP available but not enabled. Call authManager.enableCDP() to use.');
      } else {
        console.log('To enable auto-refresh, launch Chrome with:');
        console.log(getBrowserDebugCommand(this.config.cdpPort));
      }
    }

    // Layer 4: Mark as expired, require manual intervention
    const currentTokens = this.getTokens();
    if (currentTokens) {
      this.setState({ status: 'expired', tokens: currentTokens });
    } else {
      this.setState({ status: 'unauthenticated' });
    }

    return false;
  }

  /**
   * Handle auth error from API call
   * Returns true if recovered, false if manual intervention needed
   */
  async handleAuthError(): Promise<boolean> {
    return this.refresh();
  }

  // ============================================================================
  // Security
  // ============================================================================

  private setSecurePermissions(): void {
    try {
      chmodSync(getCachePath(), 0o600);
    } catch {
      // Ignore errors (file might not exist yet)
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================

  reset(): void {
    this.setState({ status: 'unauthenticated' });
  }

  /**
   * Clear singleton (for testing)
   */
  static clearInstance(): void {
    AuthManager.instance = null;
  }
}

// Export singleton getter
export function getAuthManager(): AuthManager {
  return AuthManager.getInstance();
}

// Export class for typing
export { AuthManager };
export type { AuthState };
