/**
 * Auth Tools
 * 
 * Tools for managing authentication
 */

import { getClient, resetClient } from "../client/api";
import {
  loadCachedTokens,
  saveTokensToCache,
  parseCookieHeader,
  validateCookies,
  extractCsrfFromHtml,
  extractSessionIdFromHtml,
} from "../auth/tokens";
import type { ToolResult, AuthTokens } from "../types";

/**
 * Reload auth tokens from disk or run headless re-authentication
 */
export async function refresh_auth(): Promise<ToolResult> {
  try {
    // Try reloading from disk first
    const cached = loadCachedTokens();
    if (cached) {
      // Reset client to force re-initialization with fresh tokens
      resetClient();
      getClient(); // This will use the cached tokens
      
      return {
        status: "success",
        message: "Auth tokens reloaded from disk cache.",
      };
    }

    return {
      status: "error",
      error: "No cached tokens found. Run 'notebooklm-mcp-auth' to authenticate.",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

/**
 * Save NotebookLM cookies (FALLBACK method)
 */
export async function save_auth_tokens(args: {
  cookies: string;
  csrf_token?: string;
  session_id?: string;
  request_body?: string;
  request_url?: string;
}): Promise<ToolResult> {
  try {
    // Parse cookies from header string
    const cookies = parseCookieHeader(args.cookies);

    // Validate required cookies
    if (!validateCookies(cookies)) {
      return {
        status: "error",
        error: "Missing required cookies. Need: SID, HSID, SSID, APISID, SAPISID",
      };
    }

    // Extract CSRF from request body if provided
    let csrfToken = args.csrf_token || "";
    if (!csrfToken && args.request_body) {
      const match = args.request_body.match(/at=([^&]+)/);
      if (match) {
        csrfToken = decodeURIComponent(match[1]);
      }
    }

    // Extract session ID from request URL if provided
    let sessionId = args.session_id || "";
    if (!sessionId && args.request_url) {
      const match = args.request_url.match(/f\.sid=(\d+)/);
      if (match) {
        sessionId = match[1];
      }
    }

    const tokens: AuthTokens = {
      cookies,
      csrfToken,
      sessionId,
      extractedAt: Date.now() / 1000,
    };

    saveTokensToCache(tokens);

    // Reset client to use new tokens
    resetClient();

    return {
      status: "success",
      message: "Auth tokens saved successfully. CSRF and session ID will be auto-extracted on first use.",
      has_csrf: Boolean(csrfToken),
      has_session_id: Boolean(sessionId),
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

// Export tool metadata for OpenCode
export const authToolsMetadata = {
  refresh_auth: {
    description: "Reload auth tokens from disk or run headless re-authentication. Call this after running notebooklm-mcp-auth to pick up new tokens.",
    args: {},
  },
  save_auth_tokens: {
    description: "Save NotebookLM cookies (FALLBACK method - try notebooklm-mcp-auth first!). Only use if the automated CLI fails.",
    args: {
      cookies: { type: "string", required: true, description: "Cookie header from Chrome DevTools" },
      csrf_token: { type: "string", optional: true, description: "Deprecated - auto-extracted" },
      session_id: { type: "string", optional: true, description: "Deprecated - auto-extracted" },
      request_body: { type: "string", optional: true, description: "Optional - contains CSRF if extracting manually" },
      request_url: { type: "string", optional: true, description: "Optional - contains session ID if extracting manually" },
    },
  },
};
