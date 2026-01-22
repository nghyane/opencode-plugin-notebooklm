/**
 * Auth token management for NotebookLM
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import type { AuthTokens } from "../types";
import { REQUIRED_COOKIES } from "../types";

// Re-export AuthTokens type for consumers
export type { AuthTokens } from "../types";

const CACHE_DIR = join(homedir(), ".notebooklm-mcp");
const CACHE_PATH = join(CACHE_DIR, "auth.json");

/**
 * Load cached auth tokens from disk
 */
export function loadCachedTokens(): AuthTokens | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    return {
      cookies: data.cookies || {},
      csrfToken: data.csrf_token || "",
      sessionId: data.session_id || "",
      extractedAt: data.extracted_at || 0,
    };
  } catch (e) {
    console.error("Failed to load cached tokens:", e);
    return null;
  }
}

/**
 * Save auth tokens to disk cache
 */
export function saveTokensToCache(tokens: AuthTokens, silent = false): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const data = {
    cookies: tokens.cookies,
    csrf_token: tokens.csrfToken,
    session_id: tokens.sessionId,
    extracted_at: tokens.extractedAt,
  };

  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
  
  if (!silent) {
    console.log(`Auth tokens cached to ${CACHE_PATH}`);
  }
}

/**
 * Validate that required cookies are present
 */
export function validateCookies(cookies: Record<string, string>): boolean {
  return REQUIRED_COOKIES.every((key) => key in cookies);
}

/**
 * Check if tokens are expired (older than maxAgeHours)
 */
export function isTokenExpired(tokens: AuthTokens, maxAgeHours = 168): boolean {
  const ageSeconds = Date.now() / 1000 - tokens.extractedAt;
  return ageSeconds > maxAgeHours * 3600;
}

/**
 * Convert cookies dict to header string
 */
export function cookiesToHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * Parse cookies from cookie header string
 */
export function parseCookieHeader(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  header.split(";").forEach((part) => {
    const [key, ...valueParts] = part.trim().split("=");
    if (key) {
      cookies[key.trim()] = valueParts.join("=").trim();
    }
  });
  
  return cookies;
}

/**
 * Extract CSRF token from NotebookLM page HTML
 */
export function extractCsrfFromHtml(html: string): string | null {
  const patterns = [
    /"SNlM0e":"([^"]+)"/,
    /at=([^&"]+)/,
    /"FdrFJe":"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract session ID from NotebookLM page HTML
 */
export function extractSessionIdFromHtml(html: string): string | null {
  const patterns = [
    /"FdrFJe":"([^"]+)"/,
    /f\.sid=(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get cache file path
 */
export function getCachePath(): string {
  return CACHE_PATH;
}
